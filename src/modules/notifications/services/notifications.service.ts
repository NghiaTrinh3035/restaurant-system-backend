import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as crypto from 'crypto';
import type Redis from 'ioredis';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import { TablesGateway } from 'src/gateway/tables.gateway';
import { getLocalNow } from 'src/modules/reservations/helpers/reservation.helper';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import {
  NotificationPreferences,
  UpdateNotificationPreferencesDto,
  mergeNotificationPreferences,
} from '../dtos/notification-preferences.dto';
import { NotificationCategory, QueryNotificationsDto } from '../dtos/query-notifications.dto';
import {
  BuiltNotificationPayload,
  PickupOrderNotificationSource,
  ReservationNotificationSource,
  buildAdminSystemAlertNotification,
  buildAuthDailyLoginNotification,
  buildAuthNewDeviceLoginNotification,
  buildAuthPasswordChangedNotification,
  buildAuthSessionsRevokedNotification,
  buildAuthWelcomeNotification,
  buildCustomerPaymentFailedNotification,
  buildCustomerPaymentRefundedNotification,
  buildCustomerPickupCreatedNotification,
  buildCustomerPickupReminderNotification,
  buildCustomerPickupStatusNotification,
  buildCustomerReservationAutoCompletedNotification,
  buildCustomerReservationCancelledNotification,
  buildCustomerReservationConfirmedNotification,
  buildCustomerReservationDepositExpiredNotification,
  buildCustomerReservationNoShowNotification,
  buildCustomerReservationReminderNotification,
  buildKitchenNewBatchNotification,
  buildKitchenPickupNewNotification,
  buildPickupOverdueNotification,
  buildStaffAccountCreatedNotification,
  buildStaffAccountStatusNotification,
  buildStaffBranchTransferredNotification,
  buildStaffKitchenItemCancelledNotification,
  buildStaffKitchenItemReadyNotification,
  buildStaffPasswordResetNotification,
  buildStaffPickupCancelledByCustomerNotification,
  buildStaffPickupCreatedNotification,
  buildStaffPickupReadyNotification,
  buildStaffReservationCancelledNotification,
  buildStaffReservationCreatedNotification,
  buildStaffReservationPreOrderUpdatedNotification,
  buildStaffTableDirtyOverdueNotification,
  buildStaffTablePaymentRequestedNotification,
} from '../helpers/notification-templates';

function isInAppCategoryEnabled(
  prefs: NotificationPreferences,
  category: NotificationCategory,
): boolean {
  switch (category) {
    case 'RESERVATION':
      return prefs.inApp.reservation;
    case 'PICKUP':
      return prefs.inApp.pickup;
    case 'KITCHEN':
      return prefs.inApp.kitchen;
    case 'PAYMENT':
      return prefs.inApp.payment;
    case 'SECURITY':
      return prefs.inApp.security;
    case 'ACCOUNT':
      return prefs.inApp.account;
    case 'SYSTEM':
    default:
      return true;
  }
}

function summarizeDevice(userAgent?: string): string {
  const ua = (userAgent || '').trim();
  if (!ua) return 'trình duyệt chưa xác định';
  let browser = 'Trình duyệt';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  let os = '';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Mac OS/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return os ? `${browser} trên ${os}` : browser;
}

function maskIp(ip?: string): string {
  const clean = (ip || '').replace(/^::ffff:/, '').trim();
  if (!clean) return 'ẩn';
  const v4 = clean.split('.');
  if (v4.length === 4) {
    return `${v4[0]}.${v4[1]}.xxx.xxx`;
  }
  return clean.slice(0, 12) + '...';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TablesGateway))
    private readonly tablesGateway: TablesGateway,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Lưu thông báo vào CSDL cho danh sách người nhận (có kiểm tra preference của từng user)
   * và phát sự kiện WebSocket `notification:new` tới từng room cá nhân `user:{userId}`.
   */
  async notifyUsers(userIds: string[], payload: BuiltNotificationPayload) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) {
      return [];
    }

    let prefMap = new Map<string, NotificationPreferences>();
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: uniqueUserIds } },
        select: { id: true, notificationPreferences: true },
      });
      prefMap = new Map(
        users.map((u) => [u.id, mergeNotificationPreferences(u.notificationPreferences)]),
      );
    } catch {
      // Bỏ qua nếu mock prisma trong unit test không có user.findMany hoặc select này
    }

    const allowedUserIds = uniqueUserIds.filter((userId) => {
      const prefs = prefMap.get(userId);
      if (!prefs) return true;
      return isInAppCategoryEnabled(prefs, payload.category);
    });

    if (allowedUserIds.length === 0) {
      return [];
    }

    const createdList = await Promise.all(
      allowedUserIds.map(async (userId) => {
        try {
          const record = await this.prisma.notification.create({
            data: {
              userId,
              branchId: payload.branchId ?? null,
              type: payload.type,
              category: payload.category,
              title: payload.title,
              body: payload.body,
              link: payload.link ?? null,
              data: payload.data,
            },
          });
          this.tablesGateway.notifyUser(userId, record);
          return record;
        } catch (err) {
          this.logger.error(`[Notification] Không thể tạo thông báo cho user ${userId}:`, err);
          return null;
        }
      }),
    );

    return createdList.filter((item) => item !== null);
  }

  /**
   * Phát thông báo tới các nhân sự thuộc một hoặc nhiều vai trò tại chi nhánh (VD: STAFF, KITCHEN).
   */
  async notifyBranchRoles(
    branchId: string,
    roles: Role[],
    payload: BuiltNotificationPayload,
  ) {
    if (!branchId || roles.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: {
        branchId,
        role: { in: roles },
        isActive: true,
      },
      select: { id: true },
    });

    return this.notifyUsers(
      users.map((u) => u.id),
      payload,
    );
  }

  /**
   * Phát thông báo tới toàn bộ nhân viên phục vụ (STAFF) đang hoạt động thuộc chi nhánh.
   */
  async notifyBranchStaff(branchId: string, payload: BuiltNotificationPayload) {
    return this.notifyBranchRoles(branchId, [Role.STAFF], payload);
  }

  /**
   * Phát thông báo tới toàn bộ Quản trị viên (ADMIN) đang hoạt động.
   */
  async notifyAdmins(payload: BuiltNotificationPayload) {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true },
    });
    return this.notifyUsers(
      admins.map((a) => a.id),
      payload,
    );
  }

  /**
   * Kiểm tra xem người dùng có bật nhận email cho nhóm Đặt bàn hay Đơn mang về không.
   * Với khách vãng lai (không có userId) luôn trả về true.
   */
  async isEmailCategoryEnabled(
    userId: string | null | undefined,
    emailCategory: 'reservation' | 'pickup',
  ): Promise<boolean> {
    if (!userId) return true;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { notificationPreferences: true },
      });
      if (!user) return true;
      const prefs = mergeNotificationPreferences(user.notificationPreferences);
      return prefs.email[emailCategory];
    } catch {
      return true;
    }
  }

  // ==========================================
  // ĐẶT BÀN (RESERVATIONS)
  // ==========================================

  async onReservationCreated(reservation: ReservationNotificationSource) {
    const payload = buildStaffReservationCreatedNotification(reservation);
    return this.notifyBranchStaff(reservation.branchId, payload);
  }

  async onReservationCancelledByCustomer(
    reservation: ReservationNotificationSource,
    reason?: string | null,
  ) {
    const payload = buildStaffReservationCancelledNotification(reservation, reason);
    return this.notifyBranchStaff(reservation.branchId, payload);
  }

  async onReservationConfirmed(reservation: ReservationNotificationSource) {
    if (!reservation.userId) return [];
    const payload = buildCustomerReservationConfirmedNotification(reservation);
    return this.notifyUsers([reservation.userId], payload);
  }

  async onReservationCancelledByStaff(
    reservation: ReservationNotificationSource,
    reason?: string | null,
  ) {
    if (!reservation.userId) return [];
    const payload = buildCustomerReservationCancelledNotification(reservation, reason);
    return this.notifyUsers([reservation.userId], payload);
  }

  async onReservationNoShow(reservation: ReservationNotificationSource) {
    if (!reservation.userId) return [];
    const payload = buildCustomerReservationNoShowNotification(reservation);
    return this.notifyUsers([reservation.userId], payload);
  }

  async onReservationReminder(reservation: ReservationNotificationSource) {
    if (!reservation.userId) return [];
    const payload = buildCustomerReservationReminderNotification(reservation);
    return this.notifyUsers([reservation.userId], payload);
  }

  async onReservationPreOrderUpdated(
    reservation: ReservationNotificationSource,
    itemCount: number,
  ) {
    const payload = buildStaffReservationPreOrderUpdatedNotification(reservation, itemCount);
    return this.notifyBranchStaff(reservation.branchId, payload);
  }

  async onReservationDepositExpired(params: {
    userId?: string | null;
    reservationId: string;
    reservationCode: string;
    branchId: string;
    reason?: string;
  }) {
    if (!params.userId) return [];
    const payload = buildCustomerReservationDepositExpiredNotification(params);
    return this.notifyUsers([params.userId], payload);
  }

  async onReservationAutoCompleted(reservation: ReservationNotificationSource) {
    if (!reservation.userId) return [];
    const payload = buildCustomerReservationAutoCompletedNotification(reservation);
    return this.notifyUsers([reservation.userId], payload);
  }

  // ==========================================
  // ĐƠN MANG VỀ (PICKUP ORDERS)
  // ==========================================

  async onPickupOrderCreated(order: PickupOrderNotificationSource) {
    const jobs: Promise<unknown>[] = [
      this.notifyBranchStaff(order.branchId, buildStaffPickupCreatedNotification(order)),
      this.notifyBranchRoles(
        order.branchId,
        [Role.KITCHEN],
        buildKitchenPickupNewNotification(order, false),
      ),
    ];

    if (order.userId) {
      jobs.push(this.notifyUsers([order.userId], buildCustomerPickupCreatedNotification(order)));
    }

    await Promise.allSettled(jobs);
  }

  async onPickupOrderStatusChanged(
    order: PickupOrderNotificationSource,
    previousStatus?: string,
  ) {
    const jobs: Promise<unknown>[] = [];

    if (order.userId) {
      jobs.push(this.notifyUsers([order.userId], buildCustomerPickupStatusNotification(order)));
    }

    if (order.status === 'CONFIRMED') {
      jobs.push(
        this.notifyBranchRoles(
          order.branchId,
          [Role.KITCHEN],
          buildKitchenPickupNewNotification(order, true),
        ),
      );
    } else if (order.status === 'READY') {
      jobs.push(
        this.notifyBranchStaff(order.branchId, buildStaffPickupReadyNotification(order)),
      );
    } else if (
      order.status === 'CANCELLED' &&
      previousStatus &&
      ['CONFIRMED', 'PREPARING', 'READY'].includes(previousStatus)
    ) {
      jobs.push(
        this.notifyBranchRoles(
          order.branchId,
          [Role.KITCHEN],
          buildStaffPickupCancelledByCustomerNotification(order, order.cancelledReason),
        ),
      );
    }

    await Promise.allSettled(jobs);
  }

  async onPickupOrderCancelledByCustomer(
    order: PickupOrderNotificationSource,
    reason?: string | null,
  ) {
    const payload = buildStaffPickupCancelledByCustomerNotification(order, reason);
    const jobs: Promise<unknown>[] = [this.notifyBranchStaff(order.branchId, payload)];

    if (['CONFIRMED', 'PREPARING'].includes(order.status)) {
      jobs.push(this.notifyBranchRoles(order.branchId, [Role.KITCHEN], payload));
    }
    if (order.userId) {
      jobs.push(
        this.notifyUsers(
          [order.userId],
          buildCustomerPickupStatusNotification({
            ...order,
            status: 'CANCELLED',
            cancelledReason: reason,
          }),
        ),
      );
    }
    await Promise.allSettled(jobs);
  }

  async onPickupOrderReminder(order: PickupOrderNotificationSource) {
    if (!order.userId) return [];
    return this.notifyUsers([order.userId], buildCustomerPickupReminderNotification(order));
  }

  async onPickupOrderOverdue(order: PickupOrderNotificationSource) {
    const jobs: Promise<unknown>[] = [
      this.notifyBranchStaff(order.branchId, buildPickupOverdueNotification(order, true)),
    ];
    if (order.userId) {
      jobs.push(
        this.notifyUsers([order.userId], buildPickupOverdueNotification(order, false)),
      );
    }
    await Promise.allSettled(jobs);
  }

  // ==========================================
  // BẾP & PHỤC VỤ TẠI QUÁN (KITCHEN & DINE-IN)
  // ==========================================

  async onKitchenNewBatch(params: {
    branchId: string;
    tableId: string;
    tableNumber: string;
    batchNumber: number;
    itemCount: number;
    invoiceCode?: string;
  }) {
    return this.notifyBranchRoles(
      params.branchId,
      [Role.KITCHEN],
      buildKitchenNewBatchNotification(params),
    );
  }

  async onKitchenItemReady(params: {
    branchId: string;
    tableId: string;
    tableNumber: string;
    itemName?: string;
    batchNumber?: number;
  }) {
    return this.notifyBranchStaff(
      params.branchId,
      buildStaffKitchenItemReadyNotification(params),
    );
  }

  async onKitchenItemCancelled(params: {
    branchId: string;
    tableId: string;
    tableNumber: string;
    itemName: string;
    reason?: string;
  }) {
    return this.notifyBranchStaff(
      params.branchId,
      buildStaffKitchenItemCancelledNotification(params),
    );
  }

  async onTablePaymentRequested(params: {
    branchId: string;
    tableId: string;
    tableNumber: string;
    invoiceId: string;
    invoiceCode: string;
    finalAmount: number;
  }) {
    return this.notifyBranchStaff(
      params.branchId,
      buildStaffTablePaymentRequestedNotification(params),
    );
  }

  async onTableDirtyOverdue(params: {
    branchId: string;
    tableId: string;
    tableNumber: string;
    minutesDirty: number;
  }) {
    return this.notifyBranchStaff(
      params.branchId,
      buildStaffTableDirtyOverdueNotification(params),
    );
  }

  // ==========================================
  // THANH TOÁN & HOÀN TIỀN (PAYMENTS)
  // ==========================================

  async onPaymentFailed(params: {
    userId?: string | null;
    branchId?: string | null;
    transactionCode: string;
    amount: number;
    targetCode?: string | null;
    targetType: 'RESERVATION' | 'PICKUP';
    reason?: string | null;
  }) {
    if (!params.userId) return [];
    return this.notifyUsers(
      [params.userId],
      buildCustomerPaymentFailedNotification(params),
    );
  }

  async onPaymentRefunded(params: {
    userId?: string | null;
    branchId?: string | null;
    amount: number;
    targetCode?: string | null;
    targetType: 'RESERVATION' | 'PICKUP';
    reason?: string | null;
  }) {
    if (!params.userId) return [];
    return this.notifyUsers(
      [params.userId],
      buildCustomerPaymentRefundedNotification(params),
    );
  }

  // ==========================================
  // ĐĂNG NHẬP & BẢO MẬT (CHUÔNG — MỖI NGÀY 1 LẦN)
  // ==========================================

  async onUserRegistered(user: { id: string; fullName: string }) {
    return this.notifyUsers([user.id], buildAuthWelcomeNotification(user.fullName));
  }

  async onUserLogin(params: {
    user: { id: string; fullName: string; role: Role };
    ip?: string;
    userAgent?: string;
    isNewGoogleUser?: boolean;
  }) {
    const { user, ip, userAgent, isNewGoogleUser } = params;
    if (isNewGoogleUser) {
      return this.notifyUsers([user.id], buildAuthWelcomeNotification(user.fullName));
    }

    const now = getLocalNow();
    const cleanIp = (ip || '').replace(/^::ffff:/, '').trim();
    const ipPrefix = cleanIp.includes('.')
      ? cleanIp.split('.').slice(0, 3).join('.')
      : cleanIp;
    const deviceHash = crypto
      .createHash('sha256')
      .update(`${(userAgent || 'unknown').toLowerCase()}|${ipPrefix}`)
      .digest('hex')
      .slice(0, 24);

    const knownDevicesKey = `auth:known-devices:${user.id}`;
    const dailyLoginKey = `auth:daily-login-notif:${user.id}:${now.date}`;

    try {
      const existingCount = await this.redis.scard(knownDevicesKey);
      const isKnownDevice = await this.redis.sismember(knownDevicesKey, deviceHash);
      await this.redis.sadd(knownDevicesKey, deviceHash);
      await this.redis.expire(knownDevicesKey, 90 * 24 * 60 * 60);

      // Thiết bị mới (khi tài khoản đã từng ghi nhận ít nhất 1 thiết bị khác trước đó)
      if (existingCount > 0 && isKnownDevice === 0) {
        const hh = String(Math.floor(now.minutes / 60)).padStart(2, '0');
        const mm = String(now.minutes % 60).padStart(2, '0');
        await this.redis.set(dailyLoginKey, '1', 'EX', 86400);
        return this.notifyUsers(
          [user.id],
          buildAuthNewDeviceLoginNotification({
            deviceSummary: summarizeDevice(userAgent),
            maskedIp: maskIp(ip),
            timeStr: `${hh}:${mm} ngày ${now.date}`,
          }),
        );
      }

      // Đăng nhập thông thường: mỗi ngày tối đa 1 thông báo vào chuông
      const claimedDaily = await this.redis.set(dailyLoginKey, '1', 'EX', 86400, 'NX');
      if (claimedDaily === 'OK') {
        return this.notifyUsers(
          [user.id],
          buildAuthDailyLoginNotification({
            fullName: user.fullName,
            role: user.role,
            dateStr: now.date,
          }),
        );
      }
    } catch (err) {
      this.logger.warn(`[AuthNotif] Lỗi xử lý thông báo đăng nhập cho ${user.id}:`, err);
    }

    return [];
  }

  async onPasswordChanged(userId: string) {
    return this.notifyUsers([userId], buildAuthPasswordChangedNotification());
  }

  async onSessionsRevoked(userId: string) {
    return this.notifyUsers([userId], buildAuthSessionsRevokedNotification());
  }

  // ==========================================
  // QUẢN LÝ NHÂN VIÊN & HỆ THỐNG ADMIN
  // ==========================================

  async onStaffCreated(staff: {
    id: string;
    fullName: string;
    email: string;
    branchId: string;
    branchName: string;
  }) {
    await Promise.allSettled([
      this.notifyUsers(
        [staff.id],
        buildStaffAccountCreatedNotification(
          staff.fullName,
          staff.branchName,
          staff.branchId,
        ),
      ),
      this.notifyAdmins(
        buildAdminSystemAlertNotification({
          title: `Nhân viên mới: ${staff.fullName}`,
          body: `Tài khoản nhân viên (${staff.email}) vừa được tạo cho chi nhánh ${staff.branchName}.`,
          branchId: staff.branchId,
          link: '/admin/staff',
        }),
      ),
    ]);
  }

  async onStaffBranchTransferred(staff: {
    id: string;
    fullName: string;
    branchId: string;
    branchName: string;
  }) {
    return this.notifyUsers(
      [staff.id],
      buildStaffBranchTransferredNotification(staff.branchName, staff.branchId),
    );
  }

  async onStaffStatusToggled(staff: {
    id: string;
    fullName: string;
    isActive: boolean;
    branchId?: string | null;
  }) {
    await Promise.allSettled([
      this.notifyUsers([staff.id], buildStaffAccountStatusNotification(staff.isActive)),
      this.notifyAdmins(
        buildAdminSystemAlertNotification({
          title: staff.isActive
            ? `Đã mở khóa tài khoản nhân viên ${staff.fullName}`
            : `Đã tạm khóa tài khoản nhân viên ${staff.fullName}`,
          body: `Trạng thái hoạt động của nhân viên ${staff.fullName} vừa được cập nhật.`,
          branchId: staff.branchId || null,
          link: '/admin/staff',
        }),
      ),
    ]);
  }

  async onStaffPasswordReset(staffId: string) {
    return this.notifyUsers([staffId], buildStaffPasswordResetNotification());
  }

  async onAdminSystemAlert(params: {
    title: string;
    body: string;
    branchId?: string | null;
    link?: string | null;
  }) {
    return this.notifyAdmins(buildAdminSystemAlertNotification(params));
  }

  // ==========================================
  // TRUY VẤN & CÀI ĐẶT THÔNG BÁO (USER API)
  // ==========================================

  async getMyNotifications(userId: string, query: QueryNotificationsDto) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 15, 100);
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(query.category ? { category: query.category } : {}),
    };

    const [items, totalItems, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      items,
      unreadCount,
      meta: new PaginationMetaDto(page, limit, totalItems),
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }

    if (existing.readAt) {
      return existing;
    }

    return this.prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now },
    });

    return {
      updatedCount: result.count,
      readAt: now,
    };
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });
    return mergeNotificationPreferences(user?.notificationPreferences);
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const next: NotificationPreferences = {
      inApp: {
        ...current.inApp,
        ...(dto.inApp ?? {}),
      },
      email: {
        ...current.email,
        ...(dto.email ?? {}),
      },
      soundEnabled:
        typeof dto.soundEnabled === 'boolean' ? dto.soundEnabled : current.soundEnabled,
    };

    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationPreferences: next as unknown as Record<string, any> },
    });

    return next;
  }
}
