import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReservationStatus } from '@prisma/client';
import { MailService } from 'src/mail/mail.service';
import {
  addDaysToDateString,
  getLocalNow,
  timeStringToMinutes,
  toDateOnly,
  toDateString,
} from 'src/modules/reservations/helpers/reservation.helper';
import { buildReservationConfirmedMailPayload } from 'src/modules/reservations/helpers/reservation-bill.helper';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/** Mặc định nhắc trước 120 phút (2 tiếng) so với giờ hẹn dùng bữa */
export const DEFAULT_RESERVATION_REMINDER_MINUTES = 120;
const REMINDER_POLL_INTERVAL_MS = 60_000;

/**
 * Kiểm tra thời điểm hẹn dùng bữa có nằm trong cửa sổ nhắc lịch (0, reminderMinutes] hay không.
 * Hỗ trợ chính xác cả trường hợp lịch hẹn qua nửa đêm (ví dụ 22:45 hôm nay nhắc đơn 00:30 ngày mai).
 */
export function isWithinReminderWindow(
  reservationDate: Date | string,
  reservationTime: string,
  nowLocal: { date: string; minutes: number },
  reminderMinutes: number = DEFAULT_RESERVATION_REMINDER_MINUTES,
): boolean {
  const resDateStr =
    reservationDate instanceof Date
      ? toDateString(reservationDate)
      : String(reservationDate).slice(0, 10);

  const resDayMinutes = Math.floor(toDateOnly(resDateStr).getTime() / 60000);
  const nowDayMinutes = Math.floor(toDateOnly(nowLocal.date).getTime() / 60000);

  const resTotalMinutes = resDayMinutes + timeStringToMinutes(reservationTime);
  const nowTotalMinutes = nowDayMinutes + nowLocal.minutes;
  const diffMinutes = resTotalMinutes - nowTotalMinutes;

  return diffMinutes > 0 && diffMinutes <= reminderMinutes;
}

@Injectable()
export class ReservationReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationReminderService.name);
  private intervalTimer: NodeJS.Timeout | null = null;
  private isScanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.intervalTimer = setInterval(() => {
      void this.runSafeScan();
    }, REMINDER_POLL_INTERVAL_MS);
    this.intervalTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private async runSafeScan(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;
    try {
      await this.handleUpcomingReservationReminders();
    } catch (err) {
      this.logger.error('[Reminder] Lỗi khi quét lịch hẹn đặt bàn sắp tới:', err);
    } finally {
      this.isScanning = false;
    }
  }

  private getReminderMinutes(): number {
    const raw = Number(this.configService.get<string | number>('RESERVATION_REMINDER_MINUTES'));
    if (Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    return DEFAULT_RESERVATION_REMINDER_MINUTES;
  }

  /**
   * Quét mỗi phút để gửi thông báo WebSocket & email nhắc lịch hẹn trước giờ dùng bữa (mặc định 2 tiếng).
   * Đảm bảo idempotency qua cột `reminderSentAt` (updateMany nguyên tử).
   */
  async handleUpcomingReservationReminders(): Promise<number> {
    const nowLocal = getLocalNow();
    const reminderMinutes = this.getReminderMinutes();
    const todayDate = toDateOnly(nowLocal.date);
    const tomorrowDate = toDateOnly(addDaysToDateString(nowLocal.date, 1));

    const candidates = await this.prisma.reservation.findMany({
      where: {
        status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING] },
        reminderSentAt: null,
        reservationDate: { in: [todayDate, tomorrowDate] },
      },
      include: {
        branch: true,
        table: true,
        reservationTables: {
          include: { table: { include: { tableType: true } } },
          orderBy: { createdAt: 'asc' },
        },
        orders: { include: { menuItem: true } },
        user: { select: { email: true, fullName: true } },
      },
    });

    let processedCount = 0;

    for (const reservation of candidates) {
      if (
        !isWithinReminderWindow(
          reservation.reservationDate,
          reservation.reservationTime,
          nowLocal,
          reminderMinutes,
        )
      ) {
        continue;
      }

      const claimed = await this.prisma.reservation.updateMany({
        where: {
          id: reservation.id,
          reminderSentAt: null,
        },
        data: {
          reminderSentAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        continue;
      }

      processedCount += 1;

      if (reservation.userId) {
        this.notificationsService.onReservationReminder(reservation).catch((err) => {
          this.logger.error(
            `[Reminder] Gửi thông báo nhắc lịch thất bại cho đơn ${reservation.reservationCode}:`,
            err,
          );
        });
      }

      const recipientEmail = reservation.customerEmail || reservation.user?.email;
      const emailAllowed = await this.notificationsService.isEmailCategoryEnabled(
        reservation.userId,
        'reservation',
      );
      if (recipientEmail && emailAllowed) {
        this.mailService
          .sendReservationReminderEmail(
            recipientEmail,
            buildReservationConfirmedMailPayload(reservation),
          )
          .catch((err) => {
            this.logger.error(
              `[Reminder] Gửi email nhắc lịch thất bại cho ${recipientEmail} (${reservation.reservationCode}):`,
              err,
            );
          });
      }
    }

    if (processedCount > 0) {
      this.logger.log(`Đã gửi nhắc lịch hẹn cho ${processedCount} đơn đặt bàn sắp tới.`);
    }

    return processedCount;
  }
}
