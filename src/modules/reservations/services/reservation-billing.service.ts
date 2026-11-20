import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  ReservationStatus,
  RestaurantTableStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import { TablesGateway } from 'src/gateway/tables.gateway';
import { PaymentsService } from 'src/modules/payments/services/payments.service';
import { generateTransactionCode } from 'src/modules/payments/helpers/payment-crypto.helper';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { SettleBillDto } from '../dto/settle-bill.dto';
import { getReservationTableIds } from '../helpers/reservation.helper';
import {
  RESERVATION_BILL_INCLUDE,
  buildReservationInvoiceMailPayload,
  closeReservationInvoicesInTx,
  computeReservationBillBreakdown,
} from '../helpers/reservation-bill.helper';
import { ReservationsService } from './reservations.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ReservationBillingService {
  private readonly logger = new Logger(ReservationBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationsService: ReservationsService,
    private readonly paymentsService: PaymentsService,
    private readonly tablesGateway: TablesGateway,
    private readonly mailService: MailService,
  ) {}

  async getReservationBill(id: string, user?: ICurrentUser) {
    const orConditions: Prisma.ReservationWhereInput[] = [{ reservationCode: id }];
    if (UUID_REGEX.test(id)) {
      orConditions.unshift({ id });
    }

    const reservation = await this.prisma.reservation.findFirst({
      where: { OR: orConditions },
      include: RESERVATION_BILL_INCLUDE,
    });

    if (!reservation) {
      throw new NotFoundException('Không tìm thấy thông tin đặt bàn.');
    }

    if (user && user.role === Role.USER && reservation.userId && reservation.userId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền truy cập hóa đơn đặt bàn này.');
    }

    const breakdown = computeReservationBillBreakdown(reservation);

    return {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      status: reservation.status,
      reservationDate: reservation.reservationDate,
      reservationTime: reservation.reservationTime,
      slotDurationMinutes: reservation.slotDurationMinutes,
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone,
      customerEmail: reservation.customerEmail || reservation.user?.email || null,
      branch: reservation.branch,
      table: reservation.table,
      reservationTables: reservation.reservationTables,
      ...breakdown,
      payments: reservation.payments.map((p) => ({
        ...p,
        amount: Number(p.amount),
      })),
    };
  }

  async settleReservationBill(
    id: string,
    dto: SettleBillDto,
    user: ICurrentUser,
    rawClientIp?: string,
  ) {
    const reservation = await this.reservationsService.getReservationById(id, user);

    if (user.role === Role.STAFF && user.branchId && reservation.branchId !== user.branchId) {
      throw new ForbiddenException('Bạn chỉ có quyền quyết toán hóa đơn thuộc chi nhánh của mình.');
    }

    if (reservation.status === ReservationStatus.COMPLETED) {
      throw new BadRequestException('Hóa đơn đặt bàn này đã được quyết toán hoàn tất trước đó.');
    }

    if (
      reservation.status === ReservationStatus.CANCELLED ||
      reservation.status === ReservationStatus.NO_SHOW
    ) {
      throw new BadRequestException('Đơn đặt bàn đã hủy hoặc vắng mặt, không thể quyết toán hóa đơn.');
    }

    const bill = await this.getReservationBill(reservation.id, user);

    if (dto.paymentMethod === PaymentProvider.MOMO || dto.paymentMethod === PaymentProvider.SEPAY) {
      if (bill.remainingAmount <= 0) {
        throw new BadRequestException('Hóa đơn không có số dư cần thanh toán trực tuyến.');
      }

      return this.paymentsService.createPayment(
        {
          provider: dto.paymentMethod,
          purpose: PaymentPurpose.RESERVATION_SETTLEMENT,
          reservationId: reservation.id,
        },
        user,
        rawClientIp,
      );
    }

    const transactionCode = generateTransactionCode('CASH');
    const now = new Date();
    const settledTableIds = getReservationTableIds(reservation);

    const { completedReservation, closedInvoices } = await this.prisma.$transaction(async (tx) => {
      if (bill.remainingAmount > 0) {
        await tx.paymentTransaction.create({
          data: {
            transactionCode,
            provider: PaymentProvider.CASH,
            purpose: PaymentPurpose.RESERVATION_SETTLEMENT,
            status: PaymentStatus.SUCCESS,
            amount: bill.remainingAmount,
            reservationId: reservation.id,
            userId: reservation.userId ? reservation.userId : null,
            paidAt: now,
            expiresAt: now,
          },
        });
      }

      const updatedReservation = await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.COMPLETED },
      });

      if (settledTableIds.length > 0) {
        await tx.restaurantTable.updateMany({
          where: { id: { in: settledTableIds } },
          data: { status: RestaurantTableStatus.DIRTY },
        });
      }

      const closedList = await closeReservationInvoicesInTx(
        tx,
        reservation.id,
        'CASH',
        now,
        bill.totalFoodAmount,
      );

      return { completedReservation: updatedReservation, closedInvoices: closedList };
    });

    const updatedBill = await this.getReservationBill(reservation.id, user);

    try {
      this.tablesGateway.server?.to(`branch:${reservation.branchId}`).emit('reservation:statusChanged', {
        id: reservation.id,
        status: ReservationStatus.COMPLETED,
      });

      this.tablesGateway.notifyReservationUpdated(reservation.branchId, completedReservation);

      for (const tableId of settledTableIds) {
        this.tablesGateway.notifyTableStatusChanged(reservation.branchId, {
          tableId,
          status: RestaurantTableStatus.DIRTY,
        });
      }

      for (const closedInv of closedInvoices) {
        this.tablesGateway.notifyTableInvoiceClosed(closedInv.branchId, closedInv.tableId, {
          invoiceId: closedInv.id,
          invoiceCode: closedInv.invoiceCode,
          finalAmount: closedInv.finalAmount,
        });
      }

      this.tablesGateway.notifyPaymentUpdated(reservation.branchId, {
        transactionCode,
        provider: PaymentProvider.CASH,
        purpose: PaymentPurpose.RESERVATION_SETTLEMENT,
        status: PaymentStatus.SUCCESS,
        amount: bill.remainingAmount,
        reservationId: reservation.id,
      });
    } catch {
      // Bỏ qua lỗi socket
    }

    if (updatedBill.customerEmail) {
      this.mailService
        .sendReservationInvoiceEmail(
          updatedBill.customerEmail,
          buildReservationInvoiceMailPayload({
            customerName: updatedBill.customerName,
            reservationCode: updatedBill.reservationCode,
            reservationDate: reservation.reservationDate,
            reservationTime: updatedBill.reservationTime,
            branch: updatedBill.branch,
            table: updatedBill.table,
            items: updatedBill.items,
            totalFoodAmount: updatedBill.totalFoodAmount,
            depositAmount: updatedBill.depositAmount,
            settlementAmount: bill.remainingAmount,
            provider: PaymentProvider.CASH,
            transactionCode,
          }),
        )
        .catch((err) => {
          this.logger.error('[Mail] Gửi email hóa đơn tiền mặt thất bại:', err);
        });
    }

    return updatedBill;
  }
}
