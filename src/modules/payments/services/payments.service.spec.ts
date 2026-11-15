import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  PickupOrderStatus,
  Role,
} from '@prisma/client';
import type Redis from 'ioredis';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import type { TablesGateway } from 'src/gateway/tables.gateway';
import type { PrismaService } from 'src/prisma/prisma.service';
import { hmacSha256Hex, hmacSha512Hex } from '../helpers/payment-crypto.helper';
import { MomoGatewayService } from './momo-gateway.service';
import { PaymentsService } from './payments.service';
import { VnpayGatewayService } from './vnpay-gateway.service';

const TEST_CONFIG: Record<string, string> = {
  'payment.callbackBaseUrl': 'https://hurling-ideally-spotting.ngrok-free.dev',
  'app.appPublicUrl': 'http://localhost:5173',
  'payment.momo.partnerCode': 'MOMO',
  'payment.momo.accessKey': 'F8BBA842ECF85',
  'payment.momo.secretKey': 'K951B6PE1waDMi640xX08PD3vg6EkVlz',
  'payment.momo.endpoint': 'https://test-payment.momo.vn/v2/gateway/api/create',
  'payment.vnpay.tmnCode': 'LRLT23Q9',
  'payment.vnpay.hashSecret': 'X6GVSTLBYL7AHBDWV4WB4EDMLQ4R0UAS',
  'payment.vnpay.url': 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
};

function createMockConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      const value = TEST_CONFIG[key];
      if (!value) {
        throw new Error(`Missing config: ${key}`);
      }
      return value;
    }),
  } as unknown as ConfigService;
}

describe('PaymentsModule security & transaction handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('MomoGatewayService', () => {
    it('verifies valid MoMo HMAC-SHA256 signature and rejects tampered amount', () => {
      const momo = new MomoGatewayService(createMockConfigService());
      const payload = {
        partnerCode: 'MOMO',
        orderId: 'MM20261115145000AABBCC',
        requestId: 'MM20261115145000AABBCC',
        amount: 150000,
        orderInfo: 'Thanh toan don mang ve PU-001',
        orderType: 'momo_wallet',
        transId: '409123456',
        resultCode: 0,
        message: 'Successful.',
        payType: 'qr',
        responseTime: '1700000000000',
        extraData: '',
      };

      const rawSignature =
        `accessKey=${TEST_CONFIG['payment.momo.accessKey']}` +
        `&amount=${payload.amount}` +
        `&extraData=${payload.extraData}` +
        `&message=${payload.message}` +
        `&orderId=${payload.orderId}` +
        `&orderInfo=${payload.orderInfo}` +
        `&orderType=${payload.orderType}` +
        `&partnerCode=${payload.partnerCode}` +
        `&payType=${payload.payType}` +
        `&requestId=${payload.requestId}` +
        `&responseTime=${payload.responseTime}` +
        `&resultCode=${payload.resultCode}` +
        `&transId=${payload.transId}`;

      const signature = hmacSha256Hex(TEST_CONFIG['payment.momo.secretKey'], rawSignature);

      const valid = momo.verifyCallback({ ...payload, signature });
      expect(valid.isValidSignature).toBe(true);
      expect(valid.isSuccess).toBe(true);
      expect(valid.amount).toBe(150000);

      const tamperedAmount = momo.verifyCallback({ ...payload, amount: 1000, signature });
      expect(tamperedAmount.isValidSignature).toBe(false);
      expect(tamperedAmount.isSuccess).toBe(false);
    });
  });

  describe('VnpayGatewayService', () => {
    it('creates signed URL and validates callback signature while rejecting tampering & HPP arrays', () => {
      const vnpay = new VnpayGatewayService(createMockConfigService());
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const paymentUrl = vnpay.createPaymentUrl({
        transactionCode: 'VN20261115145000DDEEFF',
        amount: 250000,
        orderInfo: 'Thanh toan don mang ve PU-002',
        clientIp: '::1',
        expiresAt,
      });

      const parsedUrl = new URL(paymentUrl);
      expect(parsedUrl.searchParams.get('vnp_Amount')).toBe('25000000');
      expect(parsedUrl.searchParams.get('vnp_IpAddr')).toBe('127.0.0.1');
      expect(parsedUrl.searchParams.get('vnp_SecureHash')).toBeTruthy();

      const callbackParams: Record<string, string> = {
        vnp_Amount: '25000000',
        vnp_BankCode: 'NCB',
        vnp_OrderInfo: 'Thanh toan don mang ve PU-002',
        vnp_ResponseCode: '00',
        vnp_TmnCode: TEST_CONFIG['payment.vnpay.tmnCode'],
        vnp_TransactionNo: '14412345',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: 'VN20261115145000DDEEFF',
      };
      const signData = Object.keys(callbackParams)
        .sort()
        .map(
          (k) =>
            `${encodeURIComponent(k).replace(/%20/g, '+')}=${encodeURIComponent(callbackParams[k]).replace(/%20/g, '+')}`,
        )
        .join('&');
      const vnp_SecureHash = hmacSha512Hex(TEST_CONFIG['payment.vnpay.hashSecret'], signData);

      const valid = vnpay.verifyCallback({ ...callbackParams, vnp_SecureHash });
      expect(valid.isValidSignature).toBe(true);
      expect(valid.isSuccess).toBe(true);
      expect(valid.amount).toBe(250000);

      const tampered = vnpay.verifyCallback({
        ...callbackParams,
        vnp_Amount: '100000',
        vnp_SecureHash,
      });
      expect(tampered.isValidSignature).toBe(false);

      const hppAttack = vnpay.verifyCallback({
        ...callbackParams,
        vnp_Amount: ['100', '25000000'] as unknown,
        vnp_SecureHash,
      });
      expect(hppAttack.isValidSignature).toBe(false);
    });
  });

  describe('PaymentsService', () => {
    const createSut = () => {
      const configService = createMockConfigService();
      const momoGateway = new MomoGatewayService(configService);
      const vnpayGateway = new VnpayGatewayService(configService);

      const tx = {
        paymentTransaction: {
          updateMany: jest.fn(),
          create: jest.fn(),
        },
        pickupOrder: {
          updateMany: jest.fn(),
        },
      };

      const prisma = {
        pickupOrder: { findUnique: jest.fn() },
        reservation: { findUnique: jest.fn() },
        paymentTransaction: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        $transaction: jest.fn((cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
      };

      const redis = {
        set: jest.fn().mockResolvedValue('OK'),
        eval: jest.fn().mockResolvedValue(1),
      };

      const tablesGateway = {
        notifyPaymentUpdated: jest.fn(),
      };

      const service = new PaymentsService(
        prisma as unknown as PrismaService,
        redis as unknown as Redis,
        momoGateway,
        vnpayGateway,
        tablesGateway as unknown as TablesGateway,
      );

      return { service, prisma, tx, redis, tablesGateway, vnpayGateway, momoGateway };
    };

    const customer: ICurrentUser = {
      id: 'user-1',
      email: 'khach@example.com',
      role: Role.USER,
    };

    it('creates VNPay payment using amount from DB and expires old pending transactions', async () => {
      const { service, prisma, tx } = createSut();
      prisma.pickupOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        orderCode: 'PU-20261115-ABCD',
        branchId: 'branch-1',
        userId: 'user-1',
        totalAmount: 185000,
        status: PickupOrderStatus.PENDING,
        payments: [],
      });
      tx.paymentTransaction.create.mockImplementation(
        ({ data }: { data: { transactionCode: string; amount: number; expiresAt: Date } }) =>
          Promise.resolve({
            id: 'ptx-1',
            ...data,
          }),
      );
      prisma.paymentTransaction.update.mockImplementation(
        ({ data }: { data: { payUrl: string } }) =>
          Promise.resolve({
            id: 'ptx-1',
            transactionCode: 'VN20261115145000112233',
            provider: PaymentProvider.VNPAY,
            purpose: PaymentPurpose.PICKUP_ORDER,
            status: PaymentStatus.PENDING,
            amount: 185000,
            payUrl: data.payUrl,
            expiresAt: new Date(),
            reservationId: null,
            pickupOrderId: 'order-1',
          }),
      );

      const res = await service.createPayment(
        {
          provider: PaymentProvider.VNPAY,
          purpose: PaymentPurpose.PICKUP_ORDER,
          pickupOrderId: 'order-1',
        },
        customer,
        '127.0.0.1',
      );

      const expireCalls = tx.paymentTransaction.updateMany.mock.calls as Array<
        [{ where: { pickupOrderId: string; status: PaymentStatus }; data: { status: PaymentStatus } }]
      >;
      const expireCallArg = expireCalls[0][0];
      expect(expireCallArg.where.pickupOrderId).toBe('order-1');
      expect(expireCallArg.where.status).toBe(PaymentStatus.PENDING);
      expect(expireCallArg.data.status).toBe(PaymentStatus.EXPIRED);
      expect(res.amount).toBe(185000);
      expect(res.payUrl).toContain('vnp_Amount=18500000');
    });

    it('blocks creating payment for another user order or already paid order', async () => {
      const { service, prisma } = createSut();

      prisma.pickupOrder.findUnique.mockResolvedValueOnce({
        id: 'order-2',
        orderCode: 'PU-002',
        branchId: 'branch-1',
        userId: 'other-user',
        totalAmount: 100000,
        status: PickupOrderStatus.PENDING,
        payments: [],
      });

      await expect(
        service.createPayment(
          {
            provider: PaymentProvider.VNPAY,
            purpose: PaymentPurpose.PICKUP_ORDER,
            pickupOrderId: 'order-2',
          },
          customer,
          '127.0.0.1',
        ),
      ).rejects.toThrow(ForbiddenException);

      prisma.pickupOrder.findUnique.mockResolvedValueOnce({
        id: 'order-3',
        orderCode: 'PU-003',
        branchId: 'branch-1',
        userId: 'user-1',
        totalAmount: 100000,
        status: PickupOrderStatus.CONFIRMED,
        payments: [{ id: 'paid-1' }],
      });

      await expect(
        service.createPayment(
          {
            provider: PaymentProvider.MOMO,
            purpose: PaymentPurpose.PICKUP_ORDER,
            pickupOrderId: 'order-3',
          },
          customer,
          '127.0.0.1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects VNPay IPN with RspCode 97 on invalid signature and 04 on amount mismatch', async () => {
      const { service, prisma, redis } = createSut();

      const invalidSigRes = await service.handleVnpayIpn({
        vnp_TxnRef: 'VN123',
        vnp_TmnCode: TEST_CONFIG['payment.vnpay.tmnCode'],
        vnp_Amount: '10000000',
        vnp_SecureHash: 'bad-signature',
      });
      expect(invalidSigRes).toEqual({ RspCode: '97', Message: 'Invalid signature' });
      expect(redis.set).not.toHaveBeenCalled();

      const params: Record<string, string> = {
        vnp_Amount: '1000000',
        vnp_ResponseCode: '00',
        vnp_TmnCode: TEST_CONFIG['payment.vnpay.tmnCode'],
        vnp_TransactionNo: '998877',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: 'VN123',
      };
      const signData = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&');
      const vnp_SecureHash = hmacSha512Hex(TEST_CONFIG['payment.vnpay.hashSecret'], signData);

      prisma.paymentTransaction.findUnique.mockResolvedValue({
        id: 'ptx-2',
        transactionCode: 'VN123',
        amount: 200000,
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.VNPAY,
        purpose: PaymentPurpose.PICKUP_ORDER,
        pickupOrderId: 'order-1',
        reservationId: null,
        pickupOrder: { id: 'order-1', branchId: 'branch-1', status: PickupOrderStatus.PENDING },
        reservation: null,
      });

      const mismatchRes = await service.handleVnpayIpn({ ...params, vnp_SecureHash });
      expect(mismatchRes).toEqual({ RspCode: '04', Message: 'Invalid amount' });
      expect(redis.eval).toHaveBeenCalledTimes(1);
    });

    it('processes valid VNPay IPN atomically, confirms pickup order, and handles idempotent replay', async () => {
      const { service, prisma, tx, redis, tablesGateway } = createSut();
      const params: Record<string, string> = {
        vnp_Amount: '20000000',
        vnp_ResponseCode: '00',
        vnp_TmnCode: TEST_CONFIG['payment.vnpay.tmnCode'],
        vnp_TransactionNo: '776655',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: 'VN20261115001',
      };
      const signData = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&');
      const vnp_SecureHash = hmacSha512Hex(TEST_CONFIG['payment.vnpay.hashSecret'], signData);

      prisma.paymentTransaction.findUnique.mockResolvedValueOnce({
        id: 'ptx-3',
        transactionCode: 'VN20261115001',
        amount: 200000,
        status: PaymentStatus.PENDING,
        provider: PaymentProvider.VNPAY,
        purpose: PaymentPurpose.PICKUP_ORDER,
        pickupOrderId: 'order-1',
        reservationId: null,
        pickupOrder: { id: 'order-1', branchId: 'branch-1', status: PickupOrderStatus.PENDING },
        reservation: null,
      });
      tx.paymentTransaction.updateMany.mockResolvedValueOnce({ count: 1 });
      tx.pickupOrder.updateMany.mockResolvedValueOnce({ count: 1 });

      const firstRes = await service.handleVnpayIpn({ ...params, vnp_SecureHash });
      expect(firstRes).toEqual({ RspCode: '00', Message: 'Confirm Success' });
      expect(tx.pickupOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: PickupOrderStatus.PENDING },
        data: { status: PickupOrderStatus.CONFIRMED },
      });
      expect(tablesGateway.notifyPaymentUpdated).toHaveBeenCalledWith(
        'branch-1',
        expect.objectContaining({
          transactionCode: 'VN20261115001',
          status: PaymentStatus.SUCCESS,
        }),
      );
      expect(redis.eval).toHaveBeenCalledTimes(1);

      prisma.paymentTransaction.findUnique.mockResolvedValueOnce({
        id: 'ptx-3',
        transactionCode: 'VN20261115001',
        amount: 200000,
        status: PaymentStatus.SUCCESS,
        provider: PaymentProvider.VNPAY,
        purpose: PaymentPurpose.PICKUP_ORDER,
        pickupOrderId: 'order-1',
        reservationId: null,
      });

      const replayRes = await service.handleVnpayIpn({ ...params, vnp_SecureHash });
      expect(replayRes).toEqual({ RspCode: '02', Message: 'Order already confirmed' });
      expect(tablesGateway.notifyPaymentUpdated).toHaveBeenCalledTimes(1);
    });

    it('validates target params, enforces ownership, and returns payment history in getPaymentsByTarget', async () => {
      const { service, prisma } = createSut();

      await expect(service.getPaymentsByTarget({}, customer)).rejects.toThrow(BadRequestException);
      await expect(
        service.getPaymentsByTarget(
          { pickupOrderId: 'order-1', reservationId: 'res-1' },
          customer,
        ),
      ).rejects.toThrow(BadRequestException);

      prisma.pickupOrder.findUnique.mockResolvedValueOnce({
        id: 'order-2',
        branchId: 'branch-1',
        userId: 'other-user',
      });
      await expect(
        service.getPaymentsByTarget({ pickupOrderId: 'order-2' }, customer),
      ).rejects.toThrow(ForbiddenException);

      prisma.pickupOrder.findUnique.mockResolvedValueOnce({
        id: 'order-1',
        branchId: 'branch-1',
        userId: 'user-1',
      });
      prisma.paymentTransaction.findMany.mockResolvedValueOnce([
        {
          id: 'ptx-10',
          transactionCode: 'MM20261115001',
          provider: PaymentProvider.MOMO,
          purpose: PaymentPurpose.PICKUP_ORDER,
          status: PaymentStatus.SUCCESS,
          amount: 150000,
          gatewayTransId: '409123456',
          gatewayResponseCode: '0',
          paidAt: new Date(),
          refundedAt: null,
          refundReason: null,
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const history = await service.getPaymentsByTarget({ pickupOrderId: 'order-1' }, customer);
      expect(history).toHaveLength(1);
      expect(history[0].transactionCode).toBe('MM20261115001');
      expect(history[0].amount).toBe(150000);
    });
  });
});
