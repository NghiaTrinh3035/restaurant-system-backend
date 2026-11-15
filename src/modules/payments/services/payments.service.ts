import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  PickupOrderStatus,
  Prisma,
  ReservationStatus,
  Role,
} from '@prisma/client';
import * as crypto from 'crypto';
import type Redis from 'ioredis';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { TablesGateway } from 'src/gateway/tables.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { QueryPaymentDto } from '../dto/query-payment.dto';
import { generateTransactionCode, normalizeClientIp } from '../helpers/payment-crypto.helper';
import { MomoCallbackRawPayload, MomoGatewayService } from './momo-gateway.service';
import { VnpayGatewayService } from './vnpay-gateway.service';

const PAYMENT_EXPIRY_MINUTES = 15;
const PAYMENT_LOCK_TTL_MS = 15000;
const RELEASE_LOCK_LUA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

type CallbackOutcome = 'OK' | 'NOT_FOUND' | 'AMOUNT_MISMATCH' | 'ALREADY_CONFIRMED';

interface ResolvedPaymentTarget {
  amount: number;
  orderInfo: string;
  reservationId: string | null;
  pickupOrderId: string | null;
}

interface GatewayProcessInput {
  transactionCode: string;
  amount: number;
  isSuccess: boolean;
  gatewayTransId: string;
  responseCode: string;
  rawPayload: Record<string, unknown>;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly momoGateway: MomoGatewayService,
    private readonly vnpayGateway: VnpayGatewayService,
    private readonly tablesGateway: TablesGateway,
  ) {}

  async createPayment(
    dto: CreatePaymentDto,
    user: ICurrentUser | undefined,
    rawClientIp?: string,
  ) {
    const clientIp = normalizeClientIp(rawClientIp);
    const target = await this.resolveTargetAndAmount(dto, user);
    const prefix = dto.provider === PaymentProvider.MOMO ? 'MM' : 'VN';
    const transactionCode = generateTransactionCode(prefix);
    const expiresAt = new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60 * 1000);

    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.updateMany({
        where: {
          purpose: dto.purpose,
          status: PaymentStatus.PENDING,
          ...(target.pickupOrderId ? { pickupOrderId: target.pickupOrderId } : {}),
          ...(target.reservationId ? { reservationId: target.reservationId } : {}),
        },
        data: { status: PaymentStatus.EXPIRED },
      });

      return tx.paymentTransaction.create({
        data: {
          transactionCode,
          provider: dto.provider,
          purpose: dto.purpose,
          status: PaymentStatus.PENDING,
          amount: target.amount,
          reservationId: target.reservationId,
          pickupOrderId: target.pickupOrderId,
          userId: user ? user.id : null,
          ipAddress: clientIp,
          expiresAt,
        },
      });
    });

    let payUrl: string;
    try {
      if (dto.provider === PaymentProvider.MOMO) {
        payUrl = await this.momoGateway.createPayment({
          transactionCode: transaction.transactionCode,
          amount: target.amount,
          orderInfo: target.orderInfo,
        });
      } else {
        payUrl = this.vnpayGateway.createPaymentUrl({
          transactionCode: transaction.transactionCode,
          amount: target.amount,
          orderInfo: target.orderInfo,
          clientIp,
          expiresAt,
        });
      }
    } catch (error) {
      await this.prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: PaymentStatus.FAILED,
          gatewayResponseCode: 'GATEWAY_CREATE_ERROR',
        },
      });
      throw error;
    }

    const updated = await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { payUrl },
      select: {
        id: true,
        transactionCode: true,
        provider: true,
        purpose: true,
        status: true,
        amount: true,
        payUrl: true,
        expiresAt: true,
        reservationId: true,
        pickupOrderId: true,
      },
    });

    return {
      ...updated,
      amount: Number(updated.amount),
    };
  }

  async handleMomoIpn(payload: MomoCallbackRawPayload): Promise<{ accepted: boolean; reason?: string }> {
    const verified = this.momoGateway.verifyCallback(payload);
    if (!verified.isValidSignature) {
      this.logger.warn(`Từ chối MoMo IPN do chữ ký không hợp lệ: orderId=${verified.transactionCode}`);
      return { accepted: false, reason: 'INVALID_SIGNATURE' };
    }

    const outcome = await this.processGatewayVerification({
      transactionCode: verified.transactionCode,
      amount: verified.amount,
      isSuccess: verified.isSuccess,
      gatewayTransId: verified.gatewayTransId,
      responseCode: verified.responseCode,
      rawPayload: payload as Record<string, unknown>,
    });

    if (outcome === 'NOT_FOUND' || outcome === 'AMOUNT_MISMATCH') {
      return { accepted: false, reason: outcome };
    }

    return { accepted: true };
  }

  async handleVnpayIpn(rawQuery: Record<string, unknown>): Promise<{ RspCode: string; Message: string }> {
    const verified = this.vnpayGateway.verifyCallback(rawQuery);
    if (!verified.isValidSignature) {
      this.logger.warn(`Từ chối VNPay IPN do chữ ký không hợp lệ: vnp_TxnRef=${verified.transactionCode}`);
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const outcome = await this.processGatewayVerification({
      transactionCode: verified.transactionCode,
      amount: verified.amount,
      isSuccess: verified.isSuccess,
      gatewayTransId: verified.gatewayTransId,
      responseCode: verified.responseCode,
      rawPayload: rawQuery,
    });

    switch (outcome) {
      case 'NOT_FOUND':
        return { RspCode: '01', Message: 'Order not found' };
      case 'AMOUNT_MISMATCH':
        return { RspCode: '04', Message: 'Invalid amount' };
      case 'ALREADY_CONFIRMED':
        return { RspCode: '02', Message: 'Order already confirmed' };
      case 'OK':
        return { RspCode: '00', Message: 'Confirm Success' };
    }
  }

  async verifyReturn(provider: PaymentProvider, rawQuery: Record<string, unknown>) {
    const verified =
      provider === PaymentProvider.MOMO
        ? this.momoGateway.verifyCallback(rawQuery)
        : this.vnpayGateway.verifyCallback(rawQuery);

    if (!verified.isValidSignature) {
      throw new BadRequestException('Chữ ký xác thực từ cổng thanh toán không hợp lệ.');
    }

    const outcome = await this.processGatewayVerification({
      transactionCode: verified.transactionCode,
      amount: verified.amount,
      isSuccess: verified.isSuccess,
      gatewayTransId: verified.gatewayTransId,
      responseCode: verified.responseCode,
      rawPayload: rawQuery,
    });

    if (outcome === 'NOT_FOUND') {
      throw new NotFoundException('Không tìm thấy giao dịch thanh toán.');
    }
    if (outcome === 'AMOUNT_MISMATCH') {
      throw new BadRequestException('Số tiền thanh toán không khớp với dữ liệu hệ thống.');
    }

    const tx = await this.prisma.paymentTransaction.findUnique({
      where: { transactionCode: verified.transactionCode },
      select: {
        id: true,
        transactionCode: true,
        provider: true,
        purpose: true,
        status: true,
        amount: true,
        gatewayResponseCode: true,
        paidAt: true,
        expiresAt: true,
        reservationId: true,
        pickupOrderId: true,
      },
    });

    if (!tx) {
      throw new NotFoundException('Không tìm thấy giao dịch thanh toán.');
    }

    return {
      ...tx,
      amount: Number(tx.amount),
    };
  }

  async getTransactionByCode(transactionCode: string, user?: ICurrentUser) {
    const tx = await this.prisma.paymentTransaction.findUnique({
      where: { transactionCode },
      include: {
        pickupOrder: { select: { id: true, orderCode: true, branchId: true, userId: true, status: true } },
        reservation: { select: { id: true, reservationCode: true, branchId: true, userId: true, status: true } },
      },
    });

    if (!tx) {
      throw new NotFoundException('Không tìm thấy giao dịch thanh toán.');
    }

    const ownerId = tx.pickupOrder?.userId ?? tx.reservation?.userId ?? tx.userId;
    const branchId = tx.pickupOrder?.branchId ?? tx.reservation?.branchId ?? null;
    if (ownerId || branchId) {
      this.assertOwnership(ownerId, branchId, user);
    }

    return {
      id: tx.id,
      transactionCode: tx.transactionCode,
      provider: tx.provider,
      purpose: tx.purpose,
      status: tx.status,
      amount: Number(tx.amount),
      gatewayResponseCode: tx.gatewayResponseCode,
      paidAt: tx.paidAt,
      expiresAt: tx.expiresAt,
      createdAt: tx.createdAt,
      pickupOrder: tx.pickupOrder
        ? {
            id: tx.pickupOrder.id,
            orderCode: tx.pickupOrder.orderCode,
            branchId: tx.pickupOrder.branchId,
            status: tx.pickupOrder.status,
          }
        : null,
      reservation: tx.reservation
        ? {
            id: tx.reservation.id,
            reservationCode: tx.reservation.reservationCode,
            branchId: tx.reservation.branchId,
            status: tx.reservation.status,
          }
        : null,
    };
  }

  async getPaymentsByTarget(query: QueryPaymentDto, user?: ICurrentUser) {
    if ((!query.pickupOrderId && !query.reservationId) || (query.pickupOrderId && query.reservationId)) {
      throw new BadRequestException(
        'Phải cung cấp đúng một tham số pickupOrderId hoặc reservationId để tra cứu giao dịch.',
      );
    }

    if (query.pickupOrderId) {
      const order = await this.prisma.pickupOrder.findUnique({
        where: { id: query.pickupOrderId },
        select: { id: true, branchId: true, userId: true },
      });
      if (!order) {
        throw new NotFoundException('Không tìm thấy đơn hàng mang về.');
      }
      this.assertOwnership(order.userId, order.branchId, user);
    } else if (query.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: query.reservationId },
        select: { id: true, branchId: true, userId: true },
      });
      if (!reservation) {
        throw new NotFoundException('Không tìm thấy đơn đặt bàn.');
      }
      this.assertOwnership(reservation.userId, reservation.branchId, user);
    }

    const transactions = await this.prisma.paymentTransaction.findMany({
      where: query.pickupOrderId
        ? { pickupOrderId: query.pickupOrderId }
        : { reservationId: query.reservationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        transactionCode: true,
        provider: true,
        purpose: true,
        status: true,
        amount: true,
        gatewayTransId: true,
        gatewayResponseCode: true,
        paidAt: true,
        refundedAt: true,
        refundReason: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return transactions.map((item) => ({
      ...item,
      amount: Number(item.amount),
    }));
  }

  async markRefunded(
    target: { pickupOrderId?: string; reservationId?: string },
    reason: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<number> {
    if (!target.pickupOrderId && !target.reservationId) {
      throw new BadRequestException('Phải chỉ định pickupOrderId hoặc reservationId để hoàn tiền.');
    }
    const client = txClient ?? this.prisma;
    const result = await client.paymentTransaction.updateMany({
      where: {
        status: PaymentStatus.SUCCESS,
        ...(target.pickupOrderId ? { pickupOrderId: target.pickupOrderId } : {}),
        ...(target.reservationId ? { reservationId: target.reservationId } : {}),
      },
      data: {
        status: PaymentStatus.REFUNDED,
        refundedAt: new Date(),
        refundReason: reason,
      },
    });
    return result.count;
  }

  private async resolveTargetAndAmount(
    dto: CreatePaymentDto,
    user?: ICurrentUser,
  ): Promise<ResolvedPaymentTarget> {
    if (dto.purpose === PaymentPurpose.PICKUP_ORDER) {
      if (!dto.pickupOrderId || dto.reservationId) {
        throw new BadRequestException('Thanh toán đơn mang về yêu cầu pickupOrderId và không truyền reservationId.');
      }
      return this.resolvePickupOrderTarget(dto.pickupOrderId, user);
    }

    if (!dto.reservationId || dto.pickupOrderId) {
      throw new BadRequestException('Thanh toán đặt bàn yêu cầu reservationId và không truyền pickupOrderId.');
    }
    return this.resolveReservationTarget(dto.reservationId, dto.purpose, user);
  }

  private async resolvePickupOrderTarget(
    pickupOrderId: string,
    user?: ICurrentUser,
  ): Promise<ResolvedPaymentTarget> {
    const order = await this.prisma.pickupOrder.findUnique({
      where: { id: pickupOrderId },
      include: {
        payments: {
          where: { purpose: PaymentPurpose.PICKUP_ORDER, status: PaymentStatus.SUCCESS },
          select: { id: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng mang về.');
    }

    this.assertOwnership(order.userId, order.branchId, user);

    if (order.status === PickupOrderStatus.CANCELLED || order.status === PickupOrderStatus.COMPLETED) {
      throw new BadRequestException('Đơn hàng đã hoàn tất hoặc đã bị hủy, không thể tạo thanh toán.');
    }
    if (order.payments.length > 0) {
      throw new ConflictException('Đơn hàng này đã được thanh toán thành công.');
    }

    const amount = Number(order.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Tổng tiền đơn hàng không hợp lệ để thanh toán.');
    }

    return {
      amount,
      orderInfo: `Thanh toan don mang ve ${order.orderCode}`,
      pickupOrderId: order.id,
      reservationId: null,
    };
  }

  private async resolveReservationTarget(
    reservationId: string,
    purpose: PaymentPurpose,
    user?: ICurrentUser,
  ): Promise<ResolvedPaymentTarget> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        orders: true,
        payments: {
          where: { status: PaymentStatus.SUCCESS },
          select: { id: true, purpose: true, amount: true },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException('Không tìm thấy đơn đặt bàn.');
    }

    this.assertOwnership(reservation.userId, reservation.branchId, user);

    if (
      reservation.status === ReservationStatus.CANCELLED ||
      reservation.status === ReservationStatus.NO_SHOW
    ) {
      throw new BadRequestException('Đơn đặt bàn đã hủy hoặc quá hạn, không thể thanh toán.');
    }

    const totalOrderAmount = reservation.orders.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );

    if (purpose === PaymentPurpose.RESERVATION_DEPOSIT) {
      if (reservation.status === ReservationStatus.COMPLETED) {
        throw new BadRequestException('Đơn đặt bàn đã kết thúc, không thể thanh toán đặt cọc.');
      }
      if (reservation.payments.some((p) => p.purpose === PaymentPurpose.RESERVATION_DEPOSIT)) {
        throw new ConflictException('Đơn đặt bàn này đã được thanh toán cọc trước đó.');
      }
      if (totalOrderAmount <= 0) {
        throw new BadRequestException('Đơn đặt bàn chưa có món đặt trước để thanh toán.');
      }
      return {
        amount: totalOrderAmount,
        orderInfo: `Thanh toan dat ban ${reservation.reservationCode}`,
        reservationId: reservation.id,
        pickupOrderId: null,
      };
    }

    if (reservation.payments.some((p) => p.purpose === PaymentPurpose.RESERVATION_SETTLEMENT)) {
      throw new ConflictException('Hóa đơn đặt bàn này đã được quyết toán.');
    }

    const depositPaid = reservation.payments
      .filter((p) => p.purpose === PaymentPurpose.RESERVATION_DEPOSIT)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const remainingAmount = totalOrderAmount - depositPaid;
    if (remainingAmount <= 0) {
      throw new BadRequestException('Hóa đơn không có số dư cần thanh toán.');
    }

    return {
      amount: remainingAmount,
      orderInfo: `Quyet toan hoa don ${reservation.reservationCode}`,
      reservationId: reservation.id,
      pickupOrderId: null,
    };
  }

  private assertOwnership(
    ownerUserId: string | null,
    branchId: string | null,
    user?: ICurrentUser,
  ) {
    if (ownerUserId) {
      if (!user) {
        throw new UnauthorizedException('Vui lòng đăng nhập để thực hiện thao tác thanh toán cho đơn này.');
      }
      if (user.role === Role.USER && ownerUserId !== user.id) {
        throw new ForbiddenException('Bạn không có quyền truy cập giao dịch của đơn này.');
      }
    }

    if (user && user.role === Role.STAFF && user.branchId && branchId && branchId !== user.branchId) {
      throw new ForbiddenException('Bạn chỉ được phép thao tác giao dịch thuộc chi nhánh của mình.');
    }
  }

  private async processGatewayVerification(input: GatewayProcessInput): Promise<CallbackOutcome> {
    const lockKey = `payment:lock:${input.transactionCode}`;
    const lockValue = crypto.randomUUID();
    const lockAcquired = await this.redis.set(lockKey, lockValue, 'PX', PAYMENT_LOCK_TTL_MS, 'NX');

    if (lockAcquired !== 'OK') {
      throw new ConflictException('Giao dịch đang được xử lý, vui lòng thử lại sau giây lát.');
    }

    try {
      const txRecord = await this.prisma.paymentTransaction.findUnique({
        where: { transactionCode: input.transactionCode },
        include: {
          pickupOrder: { select: { id: true, branchId: true, status: true } },
          reservation: { select: { id: true, branchId: true, status: true } },
        },
      });

      if (!txRecord) {
        return 'NOT_FOUND';
      }

      if (Math.round(Number(txRecord.amount)) !== Math.round(input.amount)) {
        this.logger.error(
          `[SECURITY] Sai lệch số tiền giao dịch ${input.transactionCode}: DB=${Number(txRecord.amount)}, Gateway=${input.amount}`,
        );
        return 'AMOUNT_MISMATCH';
      }

      if (txRecord.status === PaymentStatus.SUCCESS) {
        return 'ALREADY_CONFIRMED';
      }

      if (txRecord.status !== PaymentStatus.PENDING) {
        return 'ALREADY_CONFIRMED';
      }

      const normalizedGatewayTransId =
        input.gatewayTransId && input.gatewayTransId !== '0' ? input.gatewayTransId : null;
      const targetStatus = input.isSuccess ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
      const sanitizedPayload = this.sanitizePayloadForStorage(input.rawPayload);

      let updatedCount = 0;
      try {
        updatedCount = await this.prisma.$transaction(async (tx) => {
          const res = await tx.paymentTransaction.updateMany({
            where: { id: txRecord.id, status: PaymentStatus.PENDING },
            data: {
              status: targetStatus,
              gatewayTransId: normalizedGatewayTransId,
              gatewayResponseCode: input.responseCode,
              rawCallbackPayload: sanitizedPayload,
              paidAt: input.isSuccess ? new Date() : null,
            },
          });

          if (res.count === 0) {
            return 0;
          }

          if (
            input.isSuccess &&
            txRecord.purpose === PaymentPurpose.PICKUP_ORDER &&
            txRecord.pickupOrderId
          ) {
            await tx.pickupOrder.updateMany({
              where: { id: txRecord.pickupOrderId, status: PickupOrderStatus.PENDING },
              data: { status: PickupOrderStatus.CONFIRMED },
            });
          }

          if (
            input.isSuccess &&
            txRecord.purpose === PaymentPurpose.RESERVATION_DEPOSIT &&
            txRecord.reservationId
          ) {
            await tx.reservation.updateMany({
              where: { id: txRecord.reservationId, status: ReservationStatus.PENDING },
              data: { status: ReservationStatus.CONFIRMED },
            });
          }

          return res.count;
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          this.logger.warn(
            `[SECURITY] Phát hiện trùng gatewayTransId=${normalizedGatewayTransId} cho ${input.transactionCode}`,
          );
          return 'ALREADY_CONFIRMED';
        }
        throw err;
      }

      if (updatedCount === 0) {
        return 'ALREADY_CONFIRMED';
      }

      const branchId = txRecord.pickupOrder?.branchId ?? txRecord.reservation?.branchId;
      if (branchId) {
        try {
          this.tablesGateway.notifyPaymentUpdated(branchId, {
            transactionCode: txRecord.transactionCode,
            provider: txRecord.provider,
            purpose: txRecord.purpose,
            status: targetStatus,
            amount: Number(txRecord.amount),
            pickupOrderId: txRecord.pickupOrderId,
            reservationId: txRecord.reservationId,
          });

          if (input.isSuccess && txRecord.pickupOrderId) {
            this.tablesGateway.server?.to(`branch:${branchId}`).emit('pickupOrder:statusChanged', {
              id: txRecord.pickupOrderId,
              status: PickupOrderStatus.CONFIRMED,
            });
          }

          if (input.isSuccess && txRecord.reservationId) {
            this.tablesGateway.server?.to(`branch:${branchId}`).emit('reservation:statusChanged', {
              id: txRecord.reservationId,
              status: ReservationStatus.CONFIRMED,
            });
          }
        } catch {
          // Bỏ qua lỗi phát sóng WebSocket để không ảnh hưởng kết quả thanh toán đã lưu
        }
      }

      return 'OK';
    } finally {
      try {
        await this.redis.eval(RELEASE_LOCK_LUA, 1, lockKey, lockValue);
      } catch (err) {
        this.logger.warn(`Không thể giải phóng Redis lock ${lockKey}:`, err);
      }
    }
  }

  private sanitizePayloadForStorage(rawPayload: Record<string, unknown>): Prisma.InputJsonValue {
    const cleaned: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(rawPayload)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
        cleaned[key] = value;
      } else if (value !== undefined) {
        cleaned[key] = JSON.stringify(value);
      }
    }
    return cleaned;
  }
}
