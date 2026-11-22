import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  PickupOrderStatus,
  ReservationStatus,
  Role,
} from '@prisma/client';
import {
  buildReservationQrPayload,
  signReservationQrCode,
  verifyReservationQrSignature,
} from 'src/modules/reservations/helpers/reservation-qr.helper';
import { NotificationsService } from './services/notifications.service';
import {
  DEFAULT_PICKUP_OVERDUE_MINUTES,
  PickupReminderService,
  isPickupOrderOverdue,
} from './services/pickup-reminder.service';
import {
  DEFAULT_RESERVATION_REMINDER_MINUTES,
  ReservationReminderService,
  isWithinReminderWindow,
} from './services/reservation-reminder.service';

describe('Notifications, Reminders, Auth Daily Login & QR Suite', () => {
  describe('isWithinReminderWindow (120 minutes default)', () => {
    it('returns true when reservation is 90 minutes away on the same day', () => {
      const nowLocal = { date: '2026-11-21', minutes: 16 * 60 };
      expect(
        isWithinReminderWindow(
          '2026-11-21',
          '17:30',
          nowLocal,
          DEFAULT_RESERVATION_REMINDER_MINUTES,
        ),
      ).toBe(true);
    });

    it('returns false when reservation is more than 120 minutes away', () => {
      const nowLocal = { date: '2026-11-21', minutes: 15 * 60 };
      expect(
        isWithinReminderWindow(
          '2026-11-21',
          '17:30',
          nowLocal,
          DEFAULT_RESERVATION_REMINDER_MINUTES,
        ),
      ).toBe(false);
    });

    it('returns false when reservation time has already started or passed', () => {
      const nowLocal = { date: '2026-11-21', minutes: 18 * 60 };
      expect(
        isWithinReminderWindow(
          '2026-11-21',
          '18:00',
          nowLocal,
          DEFAULT_RESERVATION_REMINDER_MINUTES,
        ),
      ).toBe(false);
    });

    it('correctly handles cross-midnight reservations (22:45 today -> 00:30 tomorrow = 105 mins)', () => {
      const nowLocal = { date: '2026-11-21', minutes: 22 * 60 + 45 };
      expect(
        isWithinReminderWindow(
          '2026-11-22',
          '00:30',
          nowLocal,
          DEFAULT_RESERVATION_REMINDER_MINUTES,
        ),
      ).toBe(true);
    });
  });

  describe('isPickupOrderOverdue (30 minutes default)', () => {
    it('returns true when elapsed time since pickupTime is >= 30 minutes', () => {
      const nowLocal = { date: '2026-11-22', minutes: 12 * 60 + 35 };
      expect(
        isPickupOrderOverdue(
          '2026-11-22',
          '12:00',
          nowLocal,
          DEFAULT_PICKUP_OVERDUE_MINUTES,
        ),
      ).toBe(true);
    });

    it('returns false when pickupTime is still in the future or < 30 minutes overdue', () => {
      const nowLocal = { date: '2026-11-22', minutes: 12 * 60 + 15 };
      expect(
        isPickupOrderOverdue(
          '2026-11-22',
          '12:00',
          nowLocal,
          DEFAULT_PICKUP_OVERDUE_MINUTES,
        ),
      ).toBe(false);
    });
  });

  describe('Reservation QR helper (HMAC signature & minimal payload)', () => {
    const secret = 'unit-test-secret-key';
    const code = 'RES-20261121-ABCD';

    it('builds minimal JSON payload without PII and compatible with staff QR scanner', () => {
      const payload = buildReservationQrPayload({
        reservationCode: code,
        branchId: '11111111-2222-3333-4444-555555555555',
      });
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      expect(parsed).toEqual({
        code,
        branchId: '11111111-2222-3333-4444-555555555555',
      });
      expect(parsed.phone).toBeUndefined();
      expect(parsed.name).toBeUndefined();
    });

    it('verifies valid signature and rejects tampered code or signature', () => {
      const sig = signReservationQrCode(code, secret);
      expect(verifyReservationQrSignature(code, sig, secret)).toBe(true);
      expect(verifyReservationQrSignature('RES-20261121-XXXX', sig, secret)).toBe(false);
      expect(verifyReservationQrSignature(code, 'invalid-signature', secret)).toBe(false);
    });
  });

  describe('NotificationsService ownership, preferences, fan-out & daily login', () => {
    const mockPrisma = {
      notification: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const mockGateway = {
      notifyUser: jest.fn(),
    };
    const mockRedis = {
      scard: jest.fn(),
      sismember: jest.fn(),
      sadd: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
    };

    let service: NotificationsService;

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.user.findMany.mockResolvedValue([]);
      service = new NotificationsService(
        mockPrisma as any,
        mockGateway as any,
        mockRedis as any,
      );
    });

    it('throws NotFoundException when user tries to mark another user notification as read', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      await expect(service.markAsRead('notif-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('fans out staff alert to all active branch staff and emits notification:new', async () => {
      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: 'staff-1' }, { id: 'staff-2' }])
        .mockResolvedValueOnce([
          { id: 'staff-1', notificationPreferences: null },
          { id: 'staff-2', notificationPreferences: null },
        ]);
      mockPrisma.notification.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `n-${data.userId}`, ...data, readAt: null, createdAt: new Date() }),
      );

      const created = await service.onReservationCreated({
        id: 'res-1',
        reservationCode: 'RES-20261121-9999',
        branchId: 'branch-1',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0901234567',
        guestCount: 4,
        reservationDate: new Date('2026-11-21T00:00:00.000Z'),
        reservationTime: '19:00',
        status: ReservationStatus.PENDING,
      });

      expect(created).toHaveLength(2);
      expect(mockGateway.notifyUser).toHaveBeenCalledTimes(2);
      expect(mockGateway.notifyUser).toHaveBeenCalledWith(
        'staff-1',
        expect.objectContaining({
          type: NotificationType.RESERVATION_CREATED,
          category: 'RESERVATION',
        }),
      );
    });

    it('skips creating notification when user disabled that in-app category in preferences', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        {
          id: 'user-muted',
          notificationPreferences: {
            inApp: { pickup: false },
          },
        },
      ]);

      const res = await service.onPickupOrderReminder({
        id: 'pu-1',
        orderCode: 'PU-20261122-1111',
        branchId: 'branch-1',
        userId: 'user-muted',
        customerName: 'Khách A',
        customerPhone: '0901234567',
        pickupDate: new Date('2026-11-22T00:00:00.000Z'),
        pickupTime: '18:00',
        totalAmount: 100000,
        status: PickupOrderStatus.CONFIRMED,
      });

      expect(res).toEqual([]);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('emits AUTH_DAILY_LOGIN only once per day for known device and skips subsequent logins same day', async () => {
      mockRedis.scard.mockResolvedValue(1);
      mockRedis.sismember.mockResolvedValue(1);
      mockRedis.set
        .mockResolvedValueOnce('OK') // first login of the day
        .mockResolvedValueOnce(null); // second login same day

      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', notificationPreferences: null },
      ]);
      mockPrisma.notification.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'n-login', ...data, readAt: null, createdAt: new Date() }),
      );

      await service.onUserLogin({
        user: { id: 'user-1', fullName: 'Nguyễn A', role: Role.USER },
        ip: '113.161.10.5',
        userAgent: 'Mozilla/5.0 Chrome/120',
      });
      await service.onUserLogin({
        user: { id: 'user-1', fullName: 'Nguyễn A', role: Role.USER },
        ip: '113.161.10.5',
        userAgent: 'Mozilla/5.0 Chrome/120',
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: NotificationType.AUTH_DAILY_LOGIN,
            category: 'SECURITY',
          }),
        }),
      );
    });
  });

  describe('ReservationReminderService & PickupReminderService atomic claims', () => {
    it('does not send duplicate reservation reminder email when updateMany claims 0 rows', async () => {
      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
      const hh = String(inOneHour.getHours()).padStart(2, '0');
      const mm = String(inOneHour.getMinutes()).padStart(2, '0');
      const yyyy = inOneHour.getFullYear();
      const mo = String(inOneHour.getMonth() + 1).padStart(2, '0');
      const dd = String(inOneHour.getDate()).padStart(2, '0');

      const mockPrisma = {
        reservation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'res-dup',
              reservationCode: 'RES-DUP',
              branchId: 'branch-1',
              userId: 'user-1',
              customerName: 'Trần B',
              customerPhone: '0909999999',
              customerEmail: 'b@example.com',
              guestCount: 2,
              reservationDate: new Date(`${yyyy}-${mo}-${dd}T00:00:00.000Z`),
              reservationTime: `${hh}:${mm}`,
              status: ReservationStatus.CONFIRMED,
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      const mockMail = { sendReservationReminderEmail: jest.fn().mockResolvedValue(undefined) };
      const mockNotif = {
        onReservationReminder: jest.fn().mockResolvedValue([]),
        isEmailCategoryEnabled: jest.fn().mockResolvedValue(true),
      };
      const mockConfig = { get: jest.fn().mockReturnValue(120) } as unknown as ConfigService;

      const reminderService = new ReservationReminderService(
        mockPrisma as any,
        mockConfig,
        mockMail as any,
        mockNotif as any,
      );

      const count = await reminderService.handleUpcomingReservationReminders();
      expect(count).toBe(0);
      expect(mockMail.sendReservationReminderEmail).not.toHaveBeenCalled();
    });

    it('sends pickup reminder 30 mins before pickupTime when claimed', async () => {
      const now = new Date();
      const inTwentyMins = new Date(now.getTime() + 20 * 60 * 1000);
      const hh = String(inTwentyMins.getHours()).padStart(2, '0');
      const mm = String(inTwentyMins.getMinutes()).padStart(2, '0');
      const yyyy = inTwentyMins.getFullYear();
      const mo = String(inTwentyMins.getMonth() + 1).padStart(2, '0');
      const dd = String(inTwentyMins.getDate()).padStart(2, '0');

      const mockPrisma = {
        pickupOrder: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              {
                id: 'pu-rem',
                orderCode: 'PU-REM-1',
                branchId: 'branch-1',
                userId: 'user-1',
                customerName: 'Lê C',
                customerPhone: '0908888888',
                customerEmail: 'c@example.com',
                pickupDate: new Date(`${yyyy}-${mo}-${dd}T00:00:00.000Z`),
                pickupTime: `${hh}:${mm}`,
                totalAmount: 250000,
                status: PickupOrderStatus.CONFIRMED,
                items: [{ quantity: 2 }],
                branch: { name: 'Chi nhánh Q1' },
              },
            ])
            .mockResolvedValueOnce([]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const mockMail = { sendPickupOrderReminderEmail: jest.fn().mockResolvedValue(undefined) };
      const mockNotif = {
        onPickupOrderReminder: jest.fn().mockResolvedValue([]),
        onPickupOrderOverdue: jest.fn().mockResolvedValue([]),
        isEmailCategoryEnabled: jest.fn().mockResolvedValue(true),
      };
      const mockConfig = { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService;
      const mockRedis = { set: jest.fn() };

      const pickupReminder = new PickupReminderService(
        mockPrisma as any,
        mockConfig,
        mockMail as any,
        mockNotif as any,
        mockRedis as any,
      );

      const res = await pickupReminder.handlePickupRemindersAndOverdues();
      expect(res).toEqual({ reminded: 1, overdueAlerted: 0 });
      expect(mockNotif.onPickupOrderReminder).toHaveBeenCalledTimes(1);
      expect(mockMail.sendPickupOrderReminderEmail).toHaveBeenCalledTimes(1);
    });
  });
});
