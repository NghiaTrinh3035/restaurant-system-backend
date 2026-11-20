import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  PickupOrderStatus,
  Prisma,
  ReservationStatus,
  RestaurantTableStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import type Redis from 'ioredis';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { TablesGateway } from 'src/gateway/tables.gateway';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import {
  RESERVATION_BILL_INCLUDE,
  RESERVATION_LIST_INCLUDE,
  buildReservationConfirmedMailPayload,
  buildReservationInvoiceMailPayload,
  closeReservationInvoicesInTx,
  computeReservationBillBreakdown,
} from 'src/modules/reservations/helpers/reservation-bill.helper';
import { getReservationTableIds } from 'src/modules/reservations/helpers/reservation.helper';
import { TableLockService } from 'src/modules/tables/services/table-lock.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { QueryPaymentDto } from '../dto/query-payment.dto';
import {
  generateTransactionCode,
  normalizeClientIp,
  sanitizePayloadForStorage,
} from '../helpers/payment-crypto.helper';
import { assertPaymentOwnership, resolvePaymentTarget } from '../helpers/payment-target.helper';
import { MomoCallbackRawPayload, MomoGatewayService } from './momo-gateway.service';
import { SepayGatewayService, SepayIpnPayload } from './sepay-gateway.service';

const PAYMENT_EXPIRY_MINUTES = 15;
const PAYMENT_LOCK_TTL_MS = 15000;
const RELEASE_LOCK_LUA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

type CallbackOutcome = 'OK' | 'NOT_FOUND' | 'AMOUNT_MISMATCH' | 'ALREADY_CONFIRMED';

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
    private readonly sepayGateway: SepayGatewayService,
    private readonly tablesGateway: TablesGateway,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => TableLockService))
    private readonly tableLockService: TableLockService,
  ) {}

  async createPayment(
    dto: CreatePaymentDto,
    user: ICurrentUser | undefined,
    rawClientIp?: string,
  ) {
    const clientIp = normalizeClientIp(rawClientIp);
    const target = await resolvePaymentTarget(this.prisma, dto, user);
    const prefix = dto.provider === PaymentProvider.MOMO ? 'MM' : dto.provider === PaymentProvider.SEPAY ? 'SP' : 'PAY';
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
      } else if (dto.provider === PaymentProvider.SEPAY) {
        payUrl = await this.sepayGateway.createPayment({
          transactionCode: transaction.transactionCode,
          amount: target.amount,
          orderInfo: target.orderInfo,
        });
      } else {
        throw new BadRequestException('Phương thức thanh toán trực tuyến không được hỗ trợ.');
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

  async handleSepayIpn(
    headers: Record<string, string | string[] | undefined>,
    payload: SepayIpnPayload,
  ): Promise<{ accepted: boolean; reason?: string }> {
    const verified = this.sepayGateway.verifyIpn(headers, payload);
    if (!verified.isValidSecret) {
      this.logger.warn(`Từ chối SePay IPN do Secret Key không hợp lệ: order_invoice_number=${verified.transactionCode}`);
      return { accepted: false, reason: 'INVALID_SECRET_KEY' };
    }

    const outcome = await this.processGatewayVerification({
      transactionCode: verified.transactionCode,
      amount: verified.amount,
      isSuccess: verified.isSuccess,
      gatewayTransId: verified.gatewayTransId,
      responseCode: verified.responseCode,
      rawPayload: payload as unknown as Record<string, unknown>,
    });

    if (outcome === 'NOT_FOUND' || outcome === 'AMOUNT_MISMATCH') {
      return { accepted: false, reason: outcome };
    }

    return { accepted: true };
  }

  async verifyReturn(provider: PaymentProvider, rawQuery: Record<string, unknown>) {
    if (provider === PaymentProvider.MOMO) {
      const verified = this.momoGateway.verifyCallback(rawQuery);

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

      return this.fetchTransactionDetails(verified.transactionCode);
    }

    if (provider === PaymentProvider.SEPAY) {
      const code = rawQuery.order_invoice_number ?? rawQuery.transactionCode;
      const transactionCode = typeof code === 'string' ? code : '';
      if (!transactionCode) {
        throw new BadRequestException('Thiếu mã giao dịch thanh toán.');
      }

      const current = await this.fetchTransactionDetails(transactionCode);
      if (current.status === PaymentStatus.PENDING) {
        const orderDetail = await this.sepayGateway.fetchOrderStatus(transactionCode);
        if (orderDetail?.found) {
          const isPaid =
            orderDetail.orderStatus === 'CAPTURED' &&
            (orderDetail.transactionStatus === 'APPROVED' || orderDetail.transactionStatus === '');
          const isCancelled =
            orderDetail.orderStatus === 'CANCELLED' || orderDetail.orderStatus === 'FAILED';

          if (isPaid || isCancelled) {
            const outcome = await this.processGatewayVerification({
              transactionCode,
              amount: orderDetail.amount,
              isSuccess: isPaid,
              gatewayTransId: orderDetail.gatewayTransId,
              responseCode: orderDetail.orderStatus,
              rawPayload: orderDetail.rawPayload,
            });
            if (outcome === 'AMOUNT_MISMATCH') {
              throw new BadRequestException('Số tiền thanh toán không khớp với dữ liệu hệ thống.');
            }
          }
        }
      }

      return this.fetchTransactionDetails(transactionCode);
    }

    throw new BadRequestException('Cổng thanh toán không được hỗ trợ.');
  }

  private async fetchTransactionDetails(transactionCode: string) {
    const tx = await this.prisma.paymentTransaction.findUnique({
      where: { transactionCode },
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
      assertPaymentOwnership(ownerId, branchId, user);
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

  async cancelPendingPayment(transactionCode: string, user?: ICurrentUser) {
    const txRecord = await this.prisma.paymentTransaction.findUnique({
      where: { transactionCode },
      include: {
        pickupOrder: { select: { id: true, branchId: true, userId: true } },
        reservation: {
          select: {
            id: true,
            branchId: true,
            status: true,
            tableId: true,
            userId: true,
            reservationDate: true,
            reservationTime: true,
            reservationTables: { select: { tableId: true } },
          },
        },
      },
    });

    if (!txRecord) {
      throw new NotFoundException('Không tìm thấy giao dịch thanh toán.');
    }

    const ownerId = txRecord.pickupOrder?.userId ?? txRecord.reservation?.userId ?? txRecord.userId;
    const branchId = txRecord.pickupOrder?.branchId ?? txRecord.reservation?.branchId ?? null;
    if (ownerId || branchId) {
      assertPaymentOwnership(ownerId, branchId, user);
    }

    if (txRecord.status !== PaymentStatus.PENDING) {
      return this.fetchTransactionDetails(transactionCode);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.paymentTransaction.updateMany({
        where: { id: txRecord.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.FAILED,
          gatewayResponseCode: 'USER_CANCELLED',
        },
      });

      if (res.count > 0 && txRecord.purpose === PaymentPurpose.RESERVATION_DEPOSIT && txRecord.reservationId) {
        await tx.reservation.updateMany({
          where: { id: txRecord.reservationId, status: ReservationStatus.AWAITING_PAYMENT },
          data: { status: ReservationStatus.CANCELLED, cancelledReason: 'Khách hàng hủy thanh toán tiền cọc.' },
        });
      }
      return res.count;
    });

    if (updated > 0 && txRecord.reservation && txRecord.reservation.status === ReservationStatus.AWAITING_PAYMENT) {
      const tableIds = getReservationTableIds(txRecord.reservation);
      if (tableIds.length > 0) {
        const dateStr = txRecord.reservation.reservationDate.toISOString().slice(0, 10);
        await this.tableLockService.releaseSlotLocksByIds(
          txRecord.reservation.branchId,
          tableIds,
          dateStr,
          txRecord.reservation.reservationTime,
        );
        try {
          this.tablesGateway.notifyTablesReleased({
            branchId: txRecord.reservation.branchId,
            tableIds,
            date: dateStr,
            time: txRecord.reservation.reservationTime,
          });
        } catch {
          // Bỏ qua lỗi socket
        }
      }
    }

    return this.fetchTransactionDetails(transactionCode);
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
      assertPaymentOwnership(order.userId, order.branchId, user);
    } else if (query.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: query.reservationId },
        select: { id: true, branchId: true, userId: true },
      });
      if (!reservation) {
        throw new NotFoundException('Không tìm thấy đơn đặt bàn.');
      }
      assertPaymentOwnership(reservation.userId, reservation.branchId, user);
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
          pickupOrder: { select: { id: true, branchId: true, status: true, userId: true } },
          reservation: {
            select: {
              id: true,
              branchId: true,
              status: true,
              tableId: true,
              userId: true,
              reservationDate: true,
              reservationTime: true,
              reservationTables: { select: { tableId: true } },
            },
          },
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

      const wasAwaitingPayment = txRecord.reservation?.status === ReservationStatus.AWAITING_PAYMENT;
      const reservationTableIds = txRecord.reservation ? getReservationTableIds(txRecord.reservation) : [];

      const normalizedGatewayTransId =
        input.gatewayTransId && input.gatewayTransId !== '0' ? input.gatewayTransId : null;
      const targetStatus = input.isSuccess ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
      const sanitizedPayload = sanitizePayloadForStorage(input.rawPayload) as Prisma.InputJsonValue;

      let txResult: {
        count: number;
        closedInvoices: Array<{
          id: string;
          invoiceCode: string;
          branchId: string;
          tableId: string;
          finalAmount: number;
        }>;
      } = { count: 0, closedInvoices: [] };
      try {
        txResult = await this.prisma.$transaction(async (tx) => {
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
            return { count: 0, closedInvoices: [] };
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
            txRecord.purpose === PaymentPurpose.RESERVATION_DEPOSIT &&
            txRecord.reservationId
          ) {
            if (input.isSuccess) {
              await tx.reservation.updateMany({
                where: {
                  id: txRecord.reservationId,
                  status: { in: [ReservationStatus.AWAITING_PAYMENT, ReservationStatus.PENDING] },
                },
                data: { status: ReservationStatus.CONFIRMED },
              });
            } else {
              await tx.reservation.updateMany({
                where: {
                  id: txRecord.reservationId,
                  status: ReservationStatus.AWAITING_PAYMENT,
                },
                data: {
                  status: ReservationStatus.CANCELLED,
                  cancelledReason: 'Thanh toán tiền cọc không thành công hoặc bị hủy.',
                },
              });
            }
          }

          const closedInvoices: Array<{
            id: string;
            invoiceCode: string;
            branchId: string;
            tableId: string;
            finalAmount: number;
          }> = [];

          if (
            input.isSuccess &&
            txRecord.purpose === PaymentPurpose.RESERVATION_SETTLEMENT &&
            txRecord.reservationId
          ) {
            await tx.reservation.updateMany({
              where: {
                id: txRecord.reservationId,
                status: { in: [ReservationStatus.SEATED, ReservationStatus.CONFIRMED] },
              },
              data: { status: ReservationStatus.COMPLETED },
            });

            if (reservationTableIds.length > 0) {
              await tx.restaurantTable.updateMany({
                where: { id: { in: reservationTableIds } },
                data: { status: RestaurantTableStatus.DIRTY },
              });
            }

            const closedList = await closeReservationInvoicesInTx(
              tx,
              txRecord.reservationId,
              txRecord.provider,
              new Date(),
            );
            closedInvoices.push(...closedList);
          }

          return { count: res.count, closedInvoices };
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

      if (txResult.count === 0) {
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
            this.tablesGateway.notifyPickupOrderEvent?.('pickupOrder:statusChanged', {
              id: txRecord.pickupOrderId,
              branchId,
              userId: txRecord.pickupOrder?.userId ?? null,
              status: PickupOrderStatus.CONFIRMED,
            } as { branchId: string; userId?: string | null });
          }

          if (
            !input.isSuccess &&
            wasAwaitingPayment &&
            txRecord.purpose === PaymentPurpose.RESERVATION_DEPOSIT &&
            txRecord.reservation
          ) {
            if (reservationTableIds.length > 0) {
              const dateStr = txRecord.reservation.reservationDate.toISOString().slice(0, 10);
              await this.tableLockService.releaseSlotLocksByIds(
                branchId,
                reservationTableIds,
                dateStr,
                txRecord.reservation.reservationTime,
              );
              this.tablesGateway.notifyTablesReleased({
                branchId,
                tableIds: reservationTableIds,
                date: dateStr,
                time: txRecord.reservation.reservationTime,
              });
            }
          }

          if (input.isSuccess && txRecord.reservationId) {
            const nextStatus =
              txRecord.purpose === PaymentPurpose.RESERVATION_SETTLEMENT
                ? ReservationStatus.COMPLETED
                : ReservationStatus.CONFIRMED;

            if (txRecord.purpose === PaymentPurpose.RESERVATION_DEPOSIT && txRecord.reservation) {
              const dateStr = txRecord.reservation.reservationDate.toISOString().slice(0, 10);
              if (reservationTableIds.length > 0) {
                await this.tableLockService.consumeSlotLocks(
                  branchId,
                  reservationTableIds,
                  dateStr,
                  txRecord.reservation.reservationTime,
                  txRecord.reservation.userId,
                );
                this.tablesGateway.notifyTablesReserved({
                  branchId,
                  tableIds: reservationTableIds,
                  date: dateStr,
                  time: txRecord.reservation.reservationTime,
                });
              }

              const confirmedRes = await this.prisma.reservation.findUnique({
                where: { id: txRecord.reservationId },
                include: {
                  ...RESERVATION_LIST_INCLUDE,
                  branch: true,
                  user: { select: { email: true, fullName: true } },
                },
              });

              if (confirmedRes) {
                if (wasAwaitingPayment) {
                  this.tablesGateway.notifyReservationCreated(branchId, confirmedRes);
                } else {
                  this.tablesGateway.notifyReservationUpdated?.(branchId, confirmedRes);
                }

                const recipientEmail = confirmedRes.customerEmail || confirmedRes.user?.email;
                if (recipientEmail) {
                  this.mailService
                    .sendReservationConfirmedEmail(
                      recipientEmail,
                      buildReservationConfirmedMailPayload(confirmedRes),
                    )
                    .catch((err) => {
                      this.logger.error(`[Mail] Gửi email xác nhận đặt bàn thất bại cho ${recipientEmail}:`, err);
                    });
                }
              }
            } else {
              this.tablesGateway.server?.to(`branch:${branchId}`).emit('reservation:statusChanged', {
                id: txRecord.reservationId,
                status: nextStatus,
              });
              this.tablesGateway.notifyReservationUpdated?.(branchId, {
                id: txRecord.reservationId,
                status: nextStatus,
                userId: txRecord.reservation?.userId ?? null,
              });
            }

            if (txRecord.purpose === PaymentPurpose.RESERVATION_SETTLEMENT) {
              for (const tableId of reservationTableIds) {
                this.tablesGateway.notifyTableStatusChanged(branchId, {
                  tableId,
                  status: RestaurantTableStatus.DIRTY,
                });
              }

              for (const closedInv of txResult.closedInvoices) {
                this.tablesGateway.notifyTableInvoiceClosed?.(
                  closedInv.branchId,
                  closedInv.tableId,
                  {
                    invoiceId: closedInv.id,
                    invoiceCode: closedInv.invoiceCode,
                    finalAmount: closedInv.finalAmount,
                  },
                );
              }

              this.sendSettlementInvoiceEmail(
                txRecord.reservationId,
                txRecord.transactionCode,
                txRecord.provider,
                Number(txRecord.amount),
              ).catch((err) => {
                this.logger.error('[Mail] Gửi email hóa đơn quyết toán thất bại:', err);
              });
            }
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

  private async sendSettlementInvoiceEmail(
    reservationId: string,
    transactionCode: string,
    provider: PaymentProvider,
    settlementAmount: number,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: RESERVATION_BILL_INCLUDE,
    });

    if (!reservation) return;
    const recipientEmail = reservation.customerEmail || reservation.user?.email;
    if (!recipientEmail) return;

    const breakdown = computeReservationBillBreakdown(reservation);

    await this.mailService.sendReservationInvoiceEmail(
      recipientEmail,
      buildReservationInvoiceMailPayload({
        customerName: reservation.customerName,
        reservationCode: reservation.reservationCode,
        reservationDate: reservation.reservationDate,
        reservationTime: reservation.reservationTime,
        branch: reservation.branch,
        table: reservation.table,
        items: breakdown.items,
        totalFoodAmount: breakdown.totalFoodAmount,
        depositAmount: breakdown.depositAmount,
        settlementAmount,
        provider,
        transactionCode,
      }),
    );
  }
}
