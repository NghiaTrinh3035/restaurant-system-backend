import { PaymentProvider, PaymentPurpose, PickupOrderStatus } from '@prisma/client';
import type { MailService } from 'src/mail/mail.service';
import type { TablesGateway } from 'src/gateway/tables.gateway';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { PaymentsService } from 'src/modules/payments/services/payments.service';
import { PickupOrdersService } from './pickup-orders.service';

describe('PickupOrdersService Payment Integration', () => {
  let service: PickupOrdersService;
  let prisma: {
    restaurantBranch: { findUnique: jest.Mock };
    branchMenuItem: { findMany: jest.Mock };
    pickupOrder: { create: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    pickupOrderItem: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let paymentsService: {
    createPayment: jest.Mock;
    markRefunded: jest.Mock;
  };
  let tablesGateway: {
    notifyPickupOrderEvent: jest.Mock;
    server: { to: jest.Mock };
  };
  let mailService: { sendPickupOrderInvoiceEmail: jest.Mock; sendPickupOrderReadyEmail: jest.Mock };

  beforeEach(() => {
    prisma = {
      restaurantBranch: { findUnique: jest.fn() },
      branchMenuItem: { findMany: jest.fn() },
      pickupOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      pickupOrderItem: { createMany: jest.fn() },
      $transaction: jest.fn((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma)),
    };

    paymentsService = {
      createPayment: jest.fn(),
      markRefunded: jest.fn(),
    };

    tablesGateway = {
      notifyPickupOrderEvent: jest.fn(),
      server: {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      },
    };

    mailService = {
      sendPickupOrderInvoiceEmail: jest.fn().mockResolvedValue(true),
      sendPickupOrderReadyEmail: jest.fn().mockResolvedValue(true),
    };

    service = new PickupOrdersService(
      prisma as unknown as PrismaService,
      tablesGateway as unknown as TablesGateway,
      mailService as unknown as MailService,
      paymentsService as unknown as PaymentsService,
    );
  });

  it('creates pickup order and generates payment URL when paymentProvider is specified', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const dateStr = futureDate.toISOString().slice(0, 10);

    prisma.restaurantBranch.findUnique.mockResolvedValue({
      id: 'branch-1',
      status: 'ACTIVE',
      operatingHours: [{ dayOfWeek: futureDate.getUTCDay(), isOpen: true, openTime: '08:00', closeTime: '22:00' }],
    });

    prisma.branchMenuItem.findMany.mockResolvedValue([
      { menuItemId: 'item-1', priceOverride: null, menuItem: { price: 50000, name: 'Burger' } },
    ]);

    prisma.pickupOrder.create.mockResolvedValue({ id: 'order-1' });
    prisma.pickupOrderItem.createMany.mockResolvedValue({ count: 1 });
    prisma.pickupOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      orderCode: 'PU-12345',
      branchId: 'branch-1',
      pickupDate: futureDate,
      pickupTime: '12:00',
      totalAmount: 50000,
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      status: PickupOrderStatus.PENDING,
      branch: { name: 'Branch 1', phone: '0909999999', streetAddress: '123 Street' },
      items: [],
    });

    paymentsService.createPayment.mockResolvedValue({
      id: 'ptx-1',
      transactionCode: 'MM20261115120000AABB',
      provider: PaymentProvider.MOMO,
      purpose: PaymentPurpose.PICKUP_ORDER,
      payUrl: 'https://test-payment.momo.vn/pay/MM20261115120000AABB',
      amount: 50000,
    });

    const res = (await service.createPickupOrder({
      branchId: 'branch-1',
      pickupDate: dateStr,
      pickupTime: '12:00',
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      paymentProvider: PaymentProvider.MOMO,
      items: [{ menuItemId: 'item-1', quantity: 1 }],
    })) as { payUrl?: string | null } | null;

    expect(paymentsService.createPayment).toHaveBeenCalledWith(
      {
        provider: PaymentProvider.MOMO,
        purpose: PaymentPurpose.PICKUP_ORDER,
        pickupOrderId: 'order-1',
      },
      undefined,
      undefined,
    );
    expect(res?.payUrl).toBe('https://test-payment.momo.vn/pay/MM20261115120000AABB');
  });

  it('triggers markRefunded when an order is cancelled', async () => {
    prisma.pickupOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      orderCode: 'PU-12345',
      branchId: 'branch-1',
      pickupDate: new Date('2026-12-01'),
      pickupTime: '12:00',
      customerName: 'Nguyen Van A',
      customerPhone: '0901234567',
      status: PickupOrderStatus.CONFIRMED,
      userId: 'user-1',
      items: [],
    });
    prisma.pickupOrder.update.mockResolvedValue({
      id: 'order-1',
      branchId: 'branch-1',
      status: PickupOrderStatus.CANCELLED,
      cancelledReason: 'Khách đổi ý',
    });
    paymentsService.markRefunded.mockResolvedValue(1);

    await service.cancelPickupOrder('order-1', 'Khách đổi ý');

    expect(paymentsService.markRefunded).toHaveBeenCalledWith(
      { pickupOrderId: 'order-1' },
      'Khách đổi ý',
    );
    expect(tablesGateway.notifyPickupOrderEvent).toHaveBeenCalledWith(
      'pickupOrder:statusChanged',
      expect.objectContaining({ id: 'order-1', status: PickupOrderStatus.CANCELLED }),
    );
  });
});
