import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PickupOrderStatus } from '@prisma/client';
import type Redis from 'ioredis';
import { MailService } from 'src/mail/mail.service';
import {
  addDaysToDateString,
  getLocalNow,
  timeStringToMinutes,
  toDateOnly,
  toDateString,
} from 'src/modules/reservations/helpers/reservation.helper';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { NotificationsService } from './notifications.service';
import { isWithinReminderWindow } from './reservation-reminder.service';

export const DEFAULT_PICKUP_REMINDER_MINUTES = 30;
export const DEFAULT_PICKUP_OVERDUE_MINUTES = 30;
const PICKUP_POLL_INTERVAL_MS = 60_000;
const PICKUP_SCAN_LOCK_KEY = 'notifications:pickup-reminder:lock';

/**
 * Kiểm tra xem đơn mang về đã quá giờ hẹn lấy bao nhiêu phút hay chưa.
 */
export function isPickupOrderOverdue(
  pickupDate: Date | string,
  pickupTime: string,
  nowLocal: { date: string; minutes: number },
  overdueMinutes: number = DEFAULT_PICKUP_OVERDUE_MINUTES,
): boolean {
  const dateStr =
    pickupDate instanceof Date
      ? toDateString(pickupDate)
      : String(pickupDate).slice(0, 10);

  const pickupDayMinutes = Math.floor(toDateOnly(dateStr).getTime() / 60000);
  const nowDayMinutes = Math.floor(toDateOnly(nowLocal.date).getTime() / 60000);

  const pickupTotalMinutes = pickupDayMinutes + timeStringToMinutes(pickupTime);
  const nowTotalMinutes = nowDayMinutes + nowLocal.minutes;
  const elapsedMinutes = nowTotalMinutes - pickupTotalMinutes;

  return elapsedMinutes >= overdueMinutes;
}

@Injectable()
export class PickupReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PickupReminderService.name);
  private intervalTimer: NodeJS.Timeout | null = null;
  private isScanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.intervalTimer = setInterval(() => {
      void this.runSafeScan();
    }, PICKUP_POLL_INTERVAL_MS);
    this.intervalTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private getMinutesSetting(envKey: string, fallback: number): number {
    const raw = Number(this.configService.get<string | number>(envKey));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  private async runSafeScan(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;
    try {
      const lock = await this.redis.set(
        PICKUP_SCAN_LOCK_KEY,
        process.pid.toString(),
        'PX',
        55_000,
        'NX',
      );
      if (lock !== 'OK') return;
      await this.handlePickupRemindersAndOverdues();
    } catch (err) {
      this.logger.error('[PickupReminder] Lỗi khi quét đơn mang về:', err);
    } finally {
      this.isScanning = false;
    }
  }

  async handlePickupRemindersAndOverdues(): Promise<{
    reminded: number;
    overdueAlerted: number;
  }> {
    const nowLocal = getLocalNow();
    const reminderMinutes = this.getMinutesSetting(
      'PICKUP_REMINDER_MINUTES',
      DEFAULT_PICKUP_REMINDER_MINUTES,
    );
    const overdueMinutes = this.getMinutesSetting(
      'PICKUP_OVERDUE_MINUTES',
      DEFAULT_PICKUP_OVERDUE_MINUTES,
    );

    const todayDate = toDateOnly(nowLocal.date);
    const tomorrowDate = toDateOnly(addDaysToDateString(nowLocal.date, 1));
    const yesterdayDate = toDateOnly(addDaysToDateString(nowLocal.date, -1));

    // 1. Nhắc lịch trước 30 phút giờ hẹn đến lấy
    const reminderCandidates = await this.prisma.pickupOrder.findMany({
      where: {
        status: {
          in: [
            PickupOrderStatus.PENDING,
            PickupOrderStatus.CONFIRMED,
            PickupOrderStatus.PREPARING,
          ],
        },
        reminderSentAt: null,
        pickupDate: { in: [todayDate, tomorrowDate] },
      },
      include: {
        branch: true,
        items: { include: { menuItem: true } },
        user: { select: { email: true, fullName: true } },
      },
    });

    let reminded = 0;
    for (const order of reminderCandidates) {
      if (
        !isWithinReminderWindow(
          order.pickupDate,
          order.pickupTime,
          nowLocal,
          reminderMinutes,
        )
      ) {
        continue;
      }

      const claimed = await this.prisma.pickupOrder.updateMany({
        where: { id: order.id, reminderSentAt: null },
        data: { reminderSentAt: new Date() },
      });
      if (claimed.count !== 1) continue;

      reminded += 1;

      if (order.userId) {
        this.notificationsService.onPickupOrderReminder(order).catch((err) => {
          this.logger.error(
            `[PickupReminder] Gửi thông báo chuông thất bại (${order.orderCode}):`,
            err,
          );
        });
      }

      const recipientEmail = order.customerEmail || order.user?.email;
      const emailAllowed = await this.notificationsService.isEmailCategoryEnabled(
        order.userId,
        'pickup',
      );
      if (recipientEmail && emailAllowed) {
        const dateStr = toDateString(order.pickupDate);
        this.mailService
          .sendPickupOrderReminderEmail(recipientEmail, {
            customerName: order.customerName,
            orderCode: order.orderCode,
            branchName: order.branch?.name || 'FoodHub Restaurant',
            branchAddress:
              order.branch?.streetAddress || order.branch?.address || null,
            branchPhone: order.branch?.phone || null,
            pickupDate: dateStr,
            pickupTime: order.pickupTime,
            totalAmount: Number(order.totalAmount),
            itemCount: order.items?.length || 0,
          })
          .catch((err) => {
            this.logger.error(
              `[PickupReminder] Gửi email nhắc lấy món thất bại (${order.orderCode}):`,
              err,
            );
          });
      }
    }

    // 2. Cảnh báo đơn READY quá 30 phút chưa có khách tới nhận
    const overdueCandidates = await this.prisma.pickupOrder.findMany({
      where: {
        status: PickupOrderStatus.READY,
        overdueNotifiedAt: null,
        pickupDate: { in: [yesterdayDate, todayDate] },
      },
      include: {
        branch: true,
        items: { include: { menuItem: true } },
      },
    });

    let overdueAlerted = 0;
    for (const order of overdueCandidates) {
      if (
        !isPickupOrderOverdue(
          order.pickupDate,
          order.pickupTime,
          nowLocal,
          overdueMinutes,
        )
      ) {
        continue;
      }

      const claimed = await this.prisma.pickupOrder.updateMany({
        where: { id: order.id, overdueNotifiedAt: null },
        data: { overdueNotifiedAt: new Date() },
      });
      if (claimed.count !== 1) continue;

      overdueAlerted += 1;

      this.notificationsService.onPickupOrderOverdue(order).catch((err) => {
        this.logger.error(
          `[PickupOverdue] Gửi cảnh báo quá hạn thất bại (${order.orderCode}):`,
          err,
        );
      });
    }

    return { reminded, overdueAlerted };
  }
}
