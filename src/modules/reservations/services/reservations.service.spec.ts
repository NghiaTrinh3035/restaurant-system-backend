import {
  InvoiceStatus,
  KitchenItemStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  ReservationStatus,
  RestaurantTableStatus,
  Role,
} from '@prisma/client';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { TablesGateway } from 'src/gateway/tables.gateway';
import type { MailService } from 'src/mail/mail.service';
import type { DineInService } from 'src/modules/dine-in/services/dine-in.service';
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
    restaurantTable: { findUnique: jest.Mock; updateMany: jest.Mock };
    paymentTransaction: { create: jest.Mock };
    invoice: { findMany: jest.Mock; update: jest.Mock };
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
  let tablesGateway: {
    notifyTableReserved: jest.Mock;
    notifyReservationCreated: jest.Mock;
    notifyReservationUpdated: jest.Mock;
    notifyTableStatusChanged: jest.Mock;
    notifyTableInvoiceClosed: jest.Mock;
    notifyPaymentUpdated: jest.Mock;
    server: { to: jest.Mock };
  };
  let tablesService: { updateTableStatus: jest.Mock };
  let mailService: { sendReservationConfirmedEmail: jest.Mock; sendReservationInvoiceEmail: jest.Mock };
  let dineInService: {
    ensureInvoiceForSeatedReservation: jest.Mock;
    closeOrFinalizeReservationInvoices: jest.Mock;
  };
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
      restaurantTable: { findUnique: jest.fn(), updateMany: jest.fn() },
      paymentTransaction: { create: jest.fn() },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
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
      notifyTableStatusChanged: jest.fn(),
      notifyTableInvoiceClosed: jest.fn(),
      notifyPaymentUpdated: jest.fn(),
      server: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
    };

    tablesService = {
      updateTableStatus: jest.fn(),
    };

    mailService = {
      sendReservationConfirmedEmail: jest.fn().mockResolvedValue(true),
      sendReservationInvoiceEmail: jest.fn().mockResolvedValue(true),
    };

    dineInService = {
      ensureInvoiceForSeatedReservation: jest.fn(),
      closeOrFinalizeReservationInvoices: jest.fn(),
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
      dineInService as unknown as DineInService,
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

    const res = (await service.createReservation({
      branchId: 'branch-1',
      customerName: 'Le Van B',
      customerPhone: '0901234567',
      guestCount: 2,
      reservationDate: '2026-11-20',
      reservationTime: '18:30',
      paymentProvider: PaymentProvider.VNPAY,
      preOrders: [{ menuItemId: 'item-1', quantity: 1 }],
    })) as { payUrl?: string | null };

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

  it('calculates bill correctly with deposit deduction in getReservationBill', async () => {
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'res-1',
      reservationCode: 'RB-1234',
      status: ReservationStatus.SEATED,
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      customerEmail: 'a@example.com',
      reservationDate: new Date('2026-11-20'),
      reservationTime: '18:00',
      slotDurationMinutes: 90,
      branch: { id: 'branch-1', name: 'Chi nhánh 1' },
      table: { id: 't1', tableNumber: '10', floor: 1 },
      orders: [
        { id: 'o1', menuItemId: 'm1', quantity: 2, unitPrice: 150000, menuItem: { name: 'Lẩu Thái' } },
        { id: 'o2', menuItemId: 'm2', quantity: 1, unitPrice: 50000, menuItem: { name: 'Trà đào' } },
      ],
      payments: [
        {
          id: 'p1',
          transactionCode: 'VN123',
          provider: PaymentProvider.VNPAY,
          purpose: PaymentPurpose.RESERVATION_DEPOSIT,
          status: PaymentStatus.SUCCESS,
          amount: 100000,
          paidAt: new Date(),
          createdAt: new Date(),
        },
      ],
      user: { id: 'u1', fullName: 'Nguyen Van A', email: 'a@example.com', phone: '0901234567' },
    });

    const bill = await service.getReservationBill('res-1', {
      id: 'staff-1',
      email: 'staff@example.com',
      role: Role.STAFF,
      branchId: 'branch-1',
    });

    expect(bill.totalFoodAmount).toBe(350000); // 150k*2 + 50k
    expect(bill.depositAmount).toBe(100000);
    expect(bill.remainingAmount).toBe(250000);
    expect(bill.isSettled).toBe(false);
  });

  it('settles bill with cash, updates table to DIRTY, and completes reservation', async () => {
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'res-1',
      reservationCode: 'RB-1234',
      status: ReservationStatus.SEATED,
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      customerEmail: 'a@example.com',
      reservationDate: new Date('2026-11-20'),
      reservationTime: '18:00',
      slotDurationMinutes: 90,
      branchId: 'branch-1',
      tableId: 't1',
      branch: { id: 'branch-1', name: 'Chi nhánh 1' },
      table: { id: 't1', tableNumber: '10', floor: 1 },
      orders: [
        { id: 'o1', menuItemId: 'm1', quantity: 1, unitPrice: 200000, menuItem: { name: 'Món ăn' } },
      ],
      payments: [],
      user: { id: 'u1', fullName: 'Nguyen Van A', email: 'a@example.com', phone: '0901234567' },
    });

    prisma.reservation.update.mockResolvedValue({ id: 'res-1', status: ReservationStatus.COMPLETED });
    prisma.paymentTransaction.create.mockResolvedValue({ id: 'ptx-new' });
    prisma.restaurantTable.updateMany.mockResolvedValue({ count: 1 });

    const settled = (await service.settleReservationBill(
      'res-1',
      { paymentMethod: PaymentProvider.CASH, note: 'Thu tiền mặt' },
      { id: 'staff-1', email: 'staff@example.com', role: Role.STAFF, branchId: 'branch-1' },
    )) as { reservationId: string };

    const createCalls = prisma.paymentTransaction.create.mock.calls as Array<
      [{ data: { provider: PaymentProvider; purpose: PaymentPurpose; status: PaymentStatus; amount: number } }]
    >;
    expect(createCalls[0][0].data.provider).toBe(PaymentProvider.CASH);
    expect(createCalls[0][0].data.purpose).toBe(PaymentPurpose.RESERVATION_SETTLEMENT);
    expect(createCalls[0][0].data.status).toBe(PaymentStatus.SUCCESS);
    expect(createCalls[0][0].data.amount).toBe(200000);

    const updateCalls = prisma.reservation.update.mock.calls as Array<
      [{ data: { status: ReservationStatus } }]
    >;
    expect(updateCalls[0][0].data.status).toBe(ReservationStatus.COMPLETED);

    expect(prisma.restaurantTable.updateMany).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: RestaurantTableStatus.DIRTY },
    });
    expect(tablesGateway.notifyTableStatusChanged).toHaveBeenCalledWith('branch-1', {
      tableId: 't1',
      status: RestaurantTableStatus.DIRTY,
    });
    expect(mailService.sendReservationInvoiceEmail).toHaveBeenCalled();
    expect(settled.reservationId).toBe('res-1');
  });

  it('includes extra dine-in OrderBatch items (excluding CANCELLED) and closes open Invoice on cash settlement', async () => {
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'res-2',
      reservationCode: 'RB-9999',
      status: ReservationStatus.SEATED,
      customerName: 'Tran Thi C',
      customerPhone: '0909888777',
      customerEmail: 'c@example.com',
      reservationDate: new Date('2026-11-20'),
      reservationTime: '19:00',
      slotDurationMinutes: 90,
      branchId: 'branch-1',
      tableId: 't2',
      branch: { id: 'branch-1', name: 'Chi nhánh 1' },
      table: { id: 't2', tableNumber: '02', floor: 1 },
      orders: [
        { id: 'o1', menuItemId: 'm1', quantity: 1, unitPrice: 100000, menuItem: { name: 'Khai vị' } },
      ],
      invoices: [
        {
          id: 'inv-2',
          invoiceCode: 'INV-2',
          discountAmount: 0,
          batches: [
            {
              batchNumber: 1,
              items: [
                {
                  id: 'oi-1',
                  menuItemId: 'm1',
                  quantity: 1,
                  unitPrice: 100000,
                  subtotal: 100000,
                  status: KitchenItemStatus.SERVED,
                  menuItem: { name: 'Khai vị', imageUrl: null },
                },
              ],
            },
            {
              batchNumber: 2,
              items: [
                {
                  id: 'oi-2',
                  menuItemId: 'm2',
                  quantity: 2,
                  unitPrice: 75000,
                  subtotal: 150000,
                  status: KitchenItemStatus.PREPARING,
                  menuItem: { name: 'Lẩu bò', imageUrl: null },
                },
                {
                  id: 'oi-3',
                  menuItemId: 'm3',
                  quantity: 1,
                  unitPrice: 50000,
                  subtotal: 50000,
                  status: KitchenItemStatus.CANCELLED,
                  menuItem: { name: 'Món đã hủy', imageUrl: null },
                },
              ],
            },
          ],
        },
      ],
      payments: [
        {
          id: 'p1',
          transactionCode: 'MM001',
          provider: PaymentProvider.MOMO,
          purpose: PaymentPurpose.RESERVATION_DEPOSIT,
          status: PaymentStatus.SUCCESS,
          amount: 100000,
          paidAt: new Date(),
          createdAt: new Date(),
        },
      ],
      user: { id: 'u2', fullName: 'Tran Thi C', email: 'c@example.com', phone: '0909888777' },
    });

    prisma.reservation.update.mockResolvedValue({
      id: 'res-2',
      status: ReservationStatus.COMPLETED,
      userId: 'u2',
    });
    prisma.paymentTransaction.create.mockResolvedValue({ id: 'ptx-settle-2' });
    prisma.restaurantTable.updateMany.mockResolvedValue({ count: 1 });
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: 'inv-2',
        invoiceCode: 'INV-2',
        branchId: 'branch-1',
        tableId: 't2',
        discountAmount: 0,
        batches: [{ id: 'b1' }, { id: 'b2' }],
      },
    ]);
    prisma.invoice.update.mockResolvedValue({
      id: 'inv-2',
      invoiceCode: 'INV-2',
      branchId: 'branch-1',
      tableId: 't2',
      finalAmount: 250000,
    });

    const settled = (await service.settleReservationBill(
      'res-2',
      { paymentMethod: PaymentProvider.CASH },
      { id: 'staff-1', email: 'staff@example.com', role: Role.STAFF, branchId: 'branch-1' },
    )) as { totalFoodAmount: number; depositAmount: number; remainingAmount: number };

    // 100k pre-order + 150k extra dish (50k cancelled item excluded) = 250k total, minus 100k deposit = 150k remaining
    expect(settled.totalFoodAmount).toBe(250000);
    expect(settled.depositAmount).toBe(100000);

    const ptxCalls = prisma.paymentTransaction.create.mock.calls as Array<[{ data: { amount: number } }]>;
    expect(ptxCalls[0][0].data.amount).toBe(150000);
    const invUpdateCalls = prisma.invoice.update.mock.calls as Array<
      [{ where: { id: string }; data: { status: InvoiceStatus; subtotal: number; finalAmount: number } }]
    >;
    expect(invUpdateCalls[0][0].where.id).toBe('inv-2');
    expect(invUpdateCalls[0][0].data.status).toBe(InvoiceStatus.PAID);
    expect(invUpdateCalls[0][0].data.subtotal).toBe(250000);
    expect(invUpdateCalls[0][0].data.finalAmount).toBe(250000);
    expect(tablesGateway.notifyTableInvoiceClosed).toHaveBeenCalledWith('branch-1', 't2', {
      invoiceId: 'inv-2',
      invoiceCode: 'INV-2',
      finalAmount: 250000,
    });
    expect(tablesGateway.notifyReservationUpdated).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({ id: 'res-2', status: ReservationStatus.COMPLETED }),
    );
  });
});
