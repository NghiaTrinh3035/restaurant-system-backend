import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  PaymentPurpose,
  PaymentStatus,
  PickupOrderStatus,
  ReservationStatus,
  Role,
} from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  RESERVATION_INVOICES_BILL_INCLUDE,
  computeReservationBillBreakdown,
} from 'src/modules/reservations/helpers/reservation-bill.helper';
import { CreatePaymentDto } from '../dto/create-payment.dto';

export interface ResolvedPaymentTarget {
  amount: number;
  orderInfo: string;
  reservationId: string | null;
  pickupOrderId: string | null;
}

export function assertPaymentOwnership(
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

export async function resolvePaymentTarget(
  prisma: PrismaService,
  dto: CreatePaymentDto,
  user?: ICurrentUser,
): Promise<ResolvedPaymentTarget> {
  if (dto.purpose === PaymentPurpose.PICKUP_ORDER) {
    if (!dto.pickupOrderId || dto.reservationId) {
      throw new BadRequestException('Thanh toán đơn mang về yêu cầu pickupOrderId và không truyền reservationId.');
    }
    return resolvePickupOrderTarget(prisma, dto.pickupOrderId, user);
  }

  if (!dto.reservationId || dto.pickupOrderId) {
    throw new BadRequestException('Thanh toán đặt bàn yêu cầu reservationId và không truyền pickupOrderId.');
  }
  return resolveReservationTarget(prisma, dto.reservationId, dto.purpose, user);
}

async function resolvePickupOrderTarget(
  prisma: PrismaService,
  pickupOrderId: string,
  user?: ICurrentUser,
): Promise<ResolvedPaymentTarget> {
  const order = await prisma.pickupOrder.findUnique({
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

  assertPaymentOwnership(order.userId, order.branchId, user);

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

async function resolveReservationTarget(
  prisma: PrismaService,
  reservationId: string,
  purpose: PaymentPurpose,
  user?: ICurrentUser,
): Promise<ResolvedPaymentTarget> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      orders: { include: { menuItem: { select: { id: true, name: true, imageUrl: true } } } },
      invoices: RESERVATION_INVOICES_BILL_INCLUDE,
      payments: {
        where: { status: PaymentStatus.SUCCESS },
        select: { id: true, purpose: true, status: true, amount: true },
      },
    },
  });

  if (!reservation) {
    throw new NotFoundException('Không tìm thấy đơn đặt bàn.');
  }

  assertPaymentOwnership(reservation.userId, reservation.branchId, user);

  if (
    reservation.status === ReservationStatus.CANCELLED ||
    reservation.status === ReservationStatus.NO_SHOW
  ) {
    throw new BadRequestException('Đơn đặt bàn đã hủy hoặc quá hạn, không thể thanh toán.');
  }

  if (purpose === PaymentPurpose.RESERVATION_DEPOSIT) {
    const totalPreOrderAmount = reservation.orders.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0,
    );
    if (reservation.status === ReservationStatus.COMPLETED) {
      throw new BadRequestException('Đơn đặt bàn đã kết thúc, không thể thanh toán đặt cọc.');
    }
    if (reservation.payments.some((p) => p.purpose === PaymentPurpose.RESERVATION_DEPOSIT)) {
      throw new ConflictException('Đơn đặt bàn này đã được thanh toán cọc trước đó.');
    }
    if (totalPreOrderAmount <= 0) {
      throw new BadRequestException('Đơn đặt bàn chưa có món đặt trước để thanh toán.');
    }
    return {
      amount: totalPreOrderAmount,
      orderInfo: `Thanh toan dat ban ${reservation.reservationCode}`,
      reservationId: reservation.id,
      pickupOrderId: null,
    };
  }

  const breakdown = computeReservationBillBreakdown(reservation);
  const hasSettlement = reservation.payments.some(
    (p) => p.purpose === PaymentPurpose.RESERVATION_SETTLEMENT,
  );
  if (hasSettlement && breakdown.remainingAmount <= 0) {
    throw new ConflictException('Hóa đơn đặt bàn này đã được quyết toán.');
  }

  if (breakdown.remainingAmount <= 0) {
    throw new BadRequestException('Hóa đơn không có số dư cần thanh toán.');
  }

  return {
    amount: breakdown.remainingAmount,
    orderInfo: `Quyet toan hoa don ${reservation.reservationCode}`,
    reservationId: reservation.id,
    pickupOrderId: null,
  };
}
