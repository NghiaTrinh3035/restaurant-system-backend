import { PaymentProvider, PaymentPurpose, ReservationStatus } from '@prisma/client';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { TablesGateway } from 'src/gateway/tables.gateway';
import type { MailService } from 'src/mail/mail.service';
import type { TablesService } from 'src/modules/tables/services/tables.service';
import type { TableLockService } from 'src/modules/tables/services/table-lock.service';
import type { ReservationAvailabilityService } from './reservation-availability.service';
import type { PaymentsService } from 'src/modules/payments/services/payments.service';
import { ReservationsService } from './reservations.service';

describe('ReservationsService Payment Integration', () => {
  let service: ReservationsService;
  let prisma: {
    branchMenuItem: { findMany: jest.Mock };
    reservation: { create: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    reservationOrder: { createMany: jest.Mock };
    restaurantTable: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let availability: {
    getBranchContext: jest.Mock;
    validateBookingTime: jest.Mock;
    getActiveReservations: jest.Mock;
    filterOverlapping: jest.Mock;
    countRemainingTables: jest.Mock;
  };
  let tableLockService: { getLockOwner: jest.Mock; consumeLock: jest.Mock };
  let tablesGateway: { notifyTableReserved: jest.Mock; notifyReservationCreated: jest.Mock; notifyReservationUpdated: jest.Mock };
  let tablesService: { updateTableStatus: jest.Mock };
  let mailService: { sendReservationConfirmedEmail: jest.Mock };
  let paymentsService: { createPayment: jest.Mock; markRefunded: jest.Mock };

  beforeEach(() => {
    prisma = {
      branchMenuItem: { findMany: jest.fn() },
      reservation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      reservationOrder: { createMany: jest.fn() },
      restaurantTable: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma)),
    };

    availability = {
      getBranchContext: jest.fn(),
      validateBookingTime: jest.fn(),
      getActiveReservations: jest.fn(),
      filterOverlapping: jest.fn(),
      countRemainingTables: jest.fn(),
    };

    tableLockService = {
      getLockOwner: jest.fn(),
      consumeLock: jest.fn(),
    };

    tablesGateway = {
      notifyTableReserved: jest.fn(),
      notifyReservationCreated: jest.fn(),
      notifyReservationUpdated: jest.fn(),
    };

    tablesService = {
      updateTableStatus: jest.fn(),
    };

    mailService = {
      sendReservationConfirmedEmail: jest.fn().mockResolvedValue(true),
    };

    paymentsService = {
      createPayment: jest.fn(),
      markRefunded: jest.fn(),
    };

    service = new ReservationsService(
      prisma as unknown as PrismaService,
      availability as unknown as ReservationAvailabilityService,
      tableLockService as unknown as TableLockService,
      tablesGateway as unknown as TablesGateway,
      tablesService as unknown as TablesService,
      mailService as unknown as MailService,
      paymentsService as unknown as PaymentsService,
    );
  });

  it('creates reservation with pre-orders and calls PaymentsService to generate deposit payUrl', async () => {
    availability.getBranchContext.mockResolvedValue({
      id: 'branch-1',
      phone: '0901234567',
      tables: [{ id: 't1', tableType: { capacity: 4 } }],
    });
    availability.validateBookingTime.mockReturnValue({ slotDuration: 90 });
    availability.getActiveReservations.mockResolvedValue([]);
    availability.filterOverlapping.mockReturnValue([]);
    availability.countRemainingTables.mockReturnValue(1);

    prisma.branchMenuItem.findMany.mockResolvedValue([
      { menuItemId: 'item-1', priceOverride: null, menuItem: { price: 100000 } },
    ]);

    prisma.reservation.create.mockResolvedValue({ id: 'res-1' });
    prisma.reservationOrder.createMany.mockResolvedValue({ count: 1 });
    prisma.reservation.findUnique.mockResolvedValue({
      id: 'res-1',
      reservationCode: 'RB-20261115-001',
      branchId: 'branch-1',
      customerName: 'Le Van B',
      customerPhone: '0901234567',
      guestCount: 2,
      reservationDate: new Date('2026-11-20'),
      reservationTime: '18:30',
      status: ReservationStatus.PENDING,
      branch: { name: 'FoodHub 1' },
      orders: [],
    });

    paymentsService.createPayment.mockResolvedValue({
      id: 'ptx-res-1',
      transactionCode: 'VN20261115183000A1B2',
      provider: PaymentProvider.VNPAY,
      purpose: PaymentPurpose.RESERVATION_DEPOSIT,
      amount: 100000,
      payUrl: 'https://sandbox.vnpayment.vn/pay/VN20261115183000A1B2',
    });

    const res = await service.createReservation({
      branchId: 'branch-1',
      customerName: 'Le Van B',
      customerPhone: '0901234567',
      guestCount: 2,
      reservationDate: '2026-11-20',
      reservationTime: '18:30',
      paymentProvider: PaymentProvider.VNPAY,
      preOrders: [{ menuItemId: 'item-1', quantity: 1 }],
    });

    expect(paymentsService.createPayment).toHaveBeenCalledWith(
      {
        provider: PaymentProvider.VNPAY,
        purpose: PaymentPurpose.RESERVATION_DEPOSIT,
        reservationId: 'res-1',
      },
      undefined,
      undefined,
    );
    expect(res.payUrl).toBe('https://sandbox.vnpayment.vn/pay/VN20261115183000A1B2');
  });

  it('triggers markRefunded when cancelling a reservation', async () => {
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'res-1',
      reservationCode: 'RB-1234',
      branchId: 'branch-1',
      status: ReservationStatus.CONFIRMED,
      userId: 'user-1',
      reservationDate: new Date('2026-12-01'),
      reservationTime: '19:00',
      orders: [],
    });
    prisma.reservation.update.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.CANCELLED,
    });
    paymentsService.markRefunded.mockResolvedValue(1);

    await service.cancelReservation('res-1', 'Bận việc đột xuất', {
      id: 'user-1',
      email: 'test@example.com',
      role: 'USER',
    });

    expect(paymentsService.markRefunded).toHaveBeenCalledWith(
      { reservationId: 'res-1' },
      'Bận việc đột xuất',
    );
  });
});
