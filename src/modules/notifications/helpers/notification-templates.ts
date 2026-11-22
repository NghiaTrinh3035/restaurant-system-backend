import { NotificationType, Prisma, ReservationStatus } from '@prisma/client';
import { formatReservationTableNames } from 'src/modules/reservations/helpers/reservation-bill.helper';
import { NotificationCategory } from '../dtos/query-notifications.dto';

export interface ReservationNotificationSource {
  id: string;
  reservationCode: string;
  branchId: string;
  userId?: string | null;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  reservationDate: Date | string;
  reservationTime: string;
  status: ReservationStatus;
  cancelledReason?: string | null;
  branch?: {
    name?: string | null;
  } | null;
  table?: { tableNumber: string; floor: number } | null;
  reservationTables?: Array<{ table?: { tableNumber: string; floor: number } | null }>;
}

export interface PickupOrderNotificationSource {
  id: string;
  orderCode: string;
  branchId: string;
  userId?: string | null;
  customerName: string;
  customerPhone: string;
  pickupDate: Date | string;
  pickupTime: string;
  totalAmount: unknown;
  status: string;
  cancelledReason?: string | null;
  branch?: {
    name?: string | null;
  } | null;
  items?: Array<{ quantity: number; menuItem?: { name?: string | null } | null }>;
}

export interface BuiltNotificationPayload {
  branchId?: string | null;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string | null;
  data: Prisma.InputJsonObject;
}

function toIsoDateStr(date: Date | string): string {
  return date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
}

function formatViDate(date: Date | string): string {
  const iso = toIsoDateStr(date);
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
}

function formatCurrency(amount: unknown): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
    Number(amount || 0),
  );
}

// ==========================================
// 1. ĐẶT BÀN (RESERVATIONS)
// ==========================================

export function buildStaffReservationCreatedNotification(
  reservation: ReservationNotificationSource,
): BuiltNotificationPayload {
  const dateStr = toIsoDateStr(reservation.reservationDate);
  const viDate = formatViDate(reservation.reservationDate);
  const { tableName } = formatReservationTableNames(reservation);
  const tableSuffix = tableName ? ` (Bàn ${tableName})` : '';

  return {
    branchId: reservation.branchId,
    type: NotificationType.RESERVATION_CREATED,
    category: 'RESERVATION',
    title: `Đơn đặt bàn mới #${reservation.reservationCode}`,
    body: `Khách ${reservation.customerName} (${reservation.customerPhone}) vừa đặt bàn cho ${reservation.guestCount} người lúc ${reservation.reservationTime} ngày ${viDate}${tableSuffix}.`,
    link: `/staff/reservations?code=${encodeURIComponent(reservation.reservationCode)}`,
    data: {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      branchId: reservation.branchId,
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone,
      guestCount: reservation.guestCount,
      reservationDate: dateStr,
      reservationTime: reservation.reservationTime,
      tableName: tableName || null,
      status: reservation.status,
    },
  };
}

export function buildStaffReservationCancelledNotification(
  reservation: ReservationNotificationSource,
  reason?: string | null,
): BuiltNotificationPayload {
  const dateStr = toIsoDateStr(reservation.reservationDate);
  const viDate = formatViDate(reservation.reservationDate);
  const finalReason = reason || reservation.cancelledReason || null;
  const reasonSuffix = finalReason ? ` — Lý do: ${finalReason}` : '';

  return {
    branchId: reservation.branchId,
    type: NotificationType.RESERVATION_CANCELLED_BY_CUSTOMER,
    category: 'RESERVATION',
    title: `Khách hủy đặt bàn #${reservation.reservationCode}`,
    body: `Khách ${reservation.customerName} (${reservation.customerPhone}) đã hủy lịch hẹn lúc ${reservation.reservationTime} ngày ${viDate}${reasonSuffix}.`,
    link: `/staff/reservations?code=${encodeURIComponent(reservation.reservationCode)}`,
    data: {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      branchId: reservation.branchId,
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone,
      guestCount: reservation.guestCount,
      reservationDate: dateStr,
      reservationTime: reservation.reservationTime,
      status: ReservationStatus.CANCELLED,
      reason: finalReason,
    },
  };
}

export function buildCustomerReservationConfirmedNotification(
  reservation: ReservationNotificationSource,
): BuiltNotificationPayload {
  const dateStr = toIsoDateStr(reservation.reservationDate);
  const viDate = formatViDate(reservation.reservationDate);
  const branchName = reservation.branch?.name || 'FoodHub Restaurant';
  const { tableName } = formatReservationTableNames(reservation);
  const tableSuffix = tableName ? ` tại Bàn ${tableName}` : '';

  return {
    branchId: reservation.branchId,
    type: NotificationType.RESERVATION_CONFIRMED,
    category: 'RESERVATION',
    title: `Đặt bàn #${reservation.reservationCode} đã được xác nhận!`,
    body: `Lịch hẹn của bạn tại ${branchName}${tableSuffix} lúc ${reservation.reservationTime} ngày ${viDate} đã được xác nhận. Mã QR Check-in đã được gửi qua email của bạn.`,
    link: `/profile?tab=reservations&code=${encodeURIComponent(reservation.reservationCode)}`,
    data: {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      branchId: reservation.branchId,
      branchName,
      guestCount: reservation.guestCount,
      reservationDate: dateStr,
      reservationTime: reservation.reservationTime,
      tableName: tableName || null,
      status: ReservationStatus.CONFIRMED,
    },
  };
}

export function buildCustomerReservationCancelledNotification(
  reservation: ReservationNotificationSource,
  reason?: string | null,
): BuiltNotificationPayload {
  const dateStr = toIsoDateStr(reservation.reservationDate);
  const viDate = formatViDate(reservation.reservationDate);
  const branchName = reservation.branch?.name || 'FoodHub Restaurant';
  const finalReason = reason || reservation.cancelledReason || null;
  const reasonSuffix = finalReason ? ` (${finalReason})` : '';

  return {
    branchId: reservation.branchId,
    type: NotificationType.RESERVATION_CANCELLED,
    category: 'RESERVATION',
    title: `Đơn đặt bàn #${reservation.reservationCode} đã bị hủy`,
    body: `Lịch đặt bàn của bạn tại ${branchName} lúc ${reservation.reservationTime} ngày ${viDate} đã bị hủy${reasonSuffix}.`,
    link: `/profile?tab=reservations&code=${encodeURIComponent(reservation.reservationCode)}`,
    data: {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      branchId: reservation.branchId,
      branchName,
      reservationDate: dateStr,
      reservationTime: reservation.reservationTime,
      status: ReservationStatus.CANCELLED,
      reason: finalReason,
    },
  };
}

export function buildCustomerReservationNoShowNotification(
  reservation: ReservationNotificationSource,
): BuiltNotificationPayload {
  const dateStr = toIsoDateStr(reservation.reservationDate);
  const viDate = formatViDate(reservation.reservationDate);
  const branchName = reservation.branch?.name || 'FoodHub Restaurant';

  return {
    branchId: reservation.branchId,
    type: NotificationType.RESERVATION_NO_SHOW,
    category: 'RESERVATION',
    title: `Quá giờ giữ bàn đơn #${reservation.reservationCode}`,
    body: `Lịch đặt bàn tại ${branchName} lúc ${reservation.reservationTime} ngày ${viDate} đã được ghi nhận vắng mặt do quá thời gian giữ bàn.`,
    link: `/profile?tab=reservations&code=${encodeURIComponent(reservation.reservationCode)}`,
    data: {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      branchId: reservation.branchId,
      branchName,
      reservationDate: dateStr,
      reservationTime: reservation.reservationTime,
      status: ReservationStatus.NO_SHOW,
    },
  };
}

export function buildCustomerReservationReminderNotification(
  reservation: ReservationNotificationSource,
): BuiltNotificationPayload {
  const dateStr = toIsoDateStr(reservation.reservationDate);
  const viDate = formatViDate(reservation.reservationDate);
  const branchName = reservation.branch?.name || 'FoodHub Restaurant';

  return {
    branchId: reservation.branchId,
    type: NotificationType.RESERVATION_REMINDER,
    category: 'RESERVATION',
    title: `Nhắc lịch hẹn dùng bữa lúc ${reservation.reservationTime}`,
    body: `Bạn có lịch đặt bàn #${reservation.reservationCode} (${reservation.guestCount} khách) tại ${branchName} vào lúc ${reservation.reservationTime} ngày ${viDate}. Hẹn gặp bạn tại nhà hàng!`,
    link: `/profile?tab=reservations&code=${encodeURIComponent(reservation.reservationCode)}`,
    data: {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      branchId: reservation.branchId,
      branchName,
      guestCount: reservation.guestCount,
      reservationDate: dateStr,
      reservationTime: reservation.reservationTime,
      status: reservation.status,
    },
  };
}

export function buildStaffReservationPreOrderUpdatedNotification(
  reservation: ReservationNotificationSource,
  itemCount: number,
): BuiltNotificationPayload {
  return {
    branchId: reservation.branchId,
    type: NotificationType.RESERVATION_PREORDER_UPDATED,
    category: 'RESERVATION',
    title: `Cập nhật món đặt trước #${reservation.reservationCode}`,
    body: `Khách ${reservation.customerName} vừa cập nhật thực đơn đặt trước (${itemCount} món) cho lịch hẹn lúc ${reservation.reservationTime}.`,
    link: `/staff/reservations?code=${encodeURIComponent(reservation.reservationCode)}`,
    data: {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      branchId: reservation.branchId,
      itemCount,
    },
  };
}

export function buildCustomerReservationDepositExpiredNotification(params: {
  reservationId: string;
  reservationCode: string;
  branchId: string;
  reason?: string;
}): BuiltNotificationPayload {
  return {
    branchId: params.branchId,
    type: NotificationType.RESERVATION_DEPOSIT_EXPIRED,
    category: 'RESERVATION',
    title: `Đơn đặt bàn #${params.reservationCode} đã hết hạn thanh toán cọc`,
    body:
      params.reason ||
      `Phiên thanh toán tiền cọc đã quá thời gian giữ chỗ nên đơn #${params.reservationCode} đã được hủy tự động.`,
    link: `/profile?tab=reservations&code=${encodeURIComponent(params.reservationCode)}`,
    data: {
      reservationId: params.reservationId,
      reservationCode: params.reservationCode,
      branchId: params.branchId,
    },
  };
}

export function buildCustomerReservationAutoCompletedNotification(
  reservation: ReservationNotificationSource,
): BuiltNotificationPayload {
  return {
    branchId: reservation.branchId,
    type: NotificationType.RESERVATION_AUTO_COMPLETED,
    category: 'RESERVATION',
    title: `Cảm ơn bạn đã dùng bữa tại FoodHub!`,
    body: `Đơn đặt bàn #${reservation.reservationCode} đã kết thúc. Rất hân hạnh được phục vụ bạn trong những lần tới!`,
    link: `/profile?tab=reservations&code=${encodeURIComponent(reservation.reservationCode)}`,
    data: {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      branchId: reservation.branchId,
    },
  };
}

// ==========================================
// 2. ĐƠN MÓN MANG VỀ (PICKUP ORDERS)
// ==========================================

export function buildCustomerPickupCreatedNotification(
  order: PickupOrderNotificationSource,
): BuiltNotificationPayload {
  const branchName = order.branch?.name || 'FoodHub Restaurant';
  const viDate = formatViDate(order.pickupDate);
  return {
    branchId: order.branchId,
    type: NotificationType.PICKUP_ORDER_CREATED,
    category: 'PICKUP',
    title: `Đặt món mang về thành công #${order.orderCode}`,
    body: `Đơn mang về tại ${branchName} hẹn lấy lúc ${order.pickupTime} ngày ${viDate} (${formatCurrency(order.totalAmount)}) đã được tiếp nhận.`,
    link: `/profile?tab=pickup-orders&code=${encodeURIComponent(order.orderCode)}`,
    data: {
      pickupOrderId: order.id,
      orderCode: order.orderCode,
      branchId: order.branchId,
      pickupDate: toIsoDateStr(order.pickupDate),
      pickupTime: order.pickupTime,
      status: order.status,
    },
  };
}

export function buildStaffPickupCreatedNotification(
  order: PickupOrderNotificationSource,
): BuiltNotificationPayload {
  const viDate = formatViDate(order.pickupDate);
  const itemCount = order.items?.length || 0;
  return {
    branchId: order.branchId,
    type: NotificationType.PICKUP_ORDER_CREATED,
    category: 'PICKUP',
    title: `Đơn mang về mới #${order.orderCode}`,
    body: `Khách ${order.customerName} (${order.customerPhone}) vừa đặt ${itemCount} món mang về, hẹn lấy lúc ${order.pickupTime} ngày ${viDate} (${formatCurrency(order.totalAmount)}).`,
    link: `/staff/pickup-orders?code=${encodeURIComponent(order.orderCode)}`,
    data: {
      pickupOrderId: order.id,
      orderCode: order.orderCode,
      branchId: order.branchId,
      customerName: order.customerName,
      pickupDate: toIsoDateStr(order.pickupDate),
      pickupTime: order.pickupTime,
      status: order.status,
    },
  };
}

export function buildKitchenPickupNewNotification(
  order: PickupOrderNotificationSource,
  confirmed = false,
): BuiltNotificationPayload {
  const itemCount = order.items?.length || 0;
  return {
    branchId: order.branchId,
    type: NotificationType.KITCHEN_NEW_PICKUP,
    category: 'KITCHEN',
    title: confirmed
      ? `Bếp: Chuẩn bị đơn mang về #${order.orderCode}`
      : `Bếp: Đơn mang về mới #${order.orderCode}`,
    body: `Đơn mang về cho khách ${order.customerName} (${itemCount} món) hẹn lấy lúc ${order.pickupTime}.`,
    link: '/kitchen',
    data: {
      pickupOrderId: order.id,
      orderCode: order.orderCode,
      branchId: order.branchId,
      pickupTime: order.pickupTime,
      status: order.status,
    },
  };
}

export function buildCustomerPickupStatusNotification(
  order: PickupOrderNotificationSource,
): BuiltNotificationPayload {
  const branchName = order.branch?.name || 'FoodHub Restaurant';
  const baseData: Prisma.InputJsonObject = {
    pickupOrderId: order.id,
    orderCode: order.orderCode,
    branchId: order.branchId,
    pickupTime: order.pickupTime,
    status: order.status,
  };
  const link = `/profile?tab=pickup-orders&code=${encodeURIComponent(order.orderCode)}`;

  switch (order.status) {
    case 'CONFIRMED':
      return {
        branchId: order.branchId,
        type: NotificationType.PICKUP_ORDER_CONFIRMED,
        category: 'PICKUP',
        title: `Đơn mang về #${order.orderCode} đã được chi nhánh tiếp nhận`,
        body: `${branchName} đã xác nhận đơn hàng của bạn và sẽ chuẩn bị đúng giờ hẹn ${order.pickupTime}.`,
        link,
        data: baseData,
      };
    case 'PREPARING':
      return {
        branchId: order.branchId,
        type: NotificationType.PICKUP_ORDER_PREPARING,
        category: 'PICKUP',
        title: `Bếp đang làm món cho đơn #${order.orderCode}`,
        body: `Món ăn trong đơn #${order.orderCode} đang được chế biến nóng hổi tại ${branchName}, sắp sẵn sàng!`,
        link,
        data: baseData,
      };
    case 'READY':
      return {
        branchId: order.branchId,
        type: NotificationType.PICKUP_ORDER_READY,
        category: 'PICKUP',
        title: `Món đã sẵn sàng! Hãy đến lấy đơn #${order.orderCode}`,
        body: `Đơn #${order.orderCode} tại ${branchName} đã nấu xong và đóng gói. Mời bạn ghé quầy nhận món ngay nhé!`,
        link,
        data: baseData,
      };
    case 'COMPLETED':
      return {
        branchId: order.branchId,
        type: NotificationType.PICKUP_ORDER_COMPLETED,
        category: 'PICKUP',
        title: `Đã giao đơn mang về #${order.orderCode}`,
        body: `Cảm ơn bạn đã đặt món tại FoodHub! Chúc bạn có một bữa ăn thật ngon miệng.`,
        link,
        data: baseData,
      };
    case 'CANCELLED':
    default: {
      const reasonSuffix = order.cancelledReason ? ` (${order.cancelledReason})` : '';
      return {
        branchId: order.branchId,
        type: NotificationType.PICKUP_ORDER_CANCELLED,
        category: 'PICKUP',
        title: `Đơn mang về #${order.orderCode} đã bị hủy`,
        body: `Đơn hàng mang về của bạn tại ${branchName} đã bị hủy${reasonSuffix}.`,
        link,
        data: { ...baseData, reason: order.cancelledReason || null },
      };
    }
  }
}

export function buildStaffPickupReadyNotification(
  order: PickupOrderNotificationSource,
): BuiltNotificationPayload {
  return {
    branchId: order.branchId,
    type: NotificationType.PICKUP_ORDER_READY,
    category: 'PICKUP',
    title: `Đơn mang về #${order.orderCode} đã làm xong`,
    body: `Bếp đã chuẩn bị xong đơn của khách ${order.customerName} (${order.customerPhone}), sẵn sàng bàn giao tại quầy.`,
    link: `/staff/pickup-orders?code=${encodeURIComponent(order.orderCode)}`,
    data: {
      pickupOrderId: order.id,
      orderCode: order.orderCode,
      branchId: order.branchId,
      status: order.status,
    },
  };
}

export function buildStaffPickupCancelledByCustomerNotification(
  order: PickupOrderNotificationSource,
  reason?: string | null,
): BuiltNotificationPayload {
  const finalReason = reason || order.cancelledReason || null;
  const suffix = finalReason ? ` — Lý do: ${finalReason}` : '';
  return {
    branchId: order.branchId,
    type: NotificationType.PICKUP_ORDER_CANCELLED_BY_CUSTOMER,
    category: 'PICKUP',
    title: `Khách hủy đơn mang về #${order.orderCode}`,
    body: `Khách ${order.customerName} (${order.customerPhone}) đã hủy đơn mang về lúc ${order.pickupTime}${suffix}.`,
    link: `/staff/pickup-orders?code=${encodeURIComponent(order.orderCode)}`,
    data: {
      pickupOrderId: order.id,
      orderCode: order.orderCode,
      branchId: order.branchId,
      reason: finalReason,
    },
  };
}

export function buildCustomerPickupReminderNotification(
  order: PickupOrderNotificationSource,
): BuiltNotificationPayload {
  const branchName = order.branch?.name || 'FoodHub Restaurant';
  return {
    branchId: order.branchId,
    type: NotificationType.PICKUP_ORDER_REMINDER,
    category: 'PICKUP',
    title: `Sắp đến giờ nhận món lúc ${order.pickupTime}`,
    body: `Bạn có lịch hẹn lấy đơn mang về #${order.orderCode} tại ${branchName} lúc ${order.pickupTime}. Đừng quên mang mã QR nhận món nhé!`,
    link: `/profile?tab=pickup-orders&code=${encodeURIComponent(order.orderCode)}`,
    data: {
      pickupOrderId: order.id,
      orderCode: order.orderCode,
      branchId: order.branchId,
      pickupTime: order.pickupTime,
    },
  };
}

export function buildPickupOverdueNotification(
  order: PickupOrderNotificationSource,
  forStaff: boolean,
): BuiltNotificationPayload {
  const branchName = order.branch?.name || 'FoodHub Restaurant';
  return {
    branchId: order.branchId,
    type: NotificationType.PICKUP_ORDER_OVERDUE,
    category: 'PICKUP',
    title: forStaff
      ? `Đơn #${order.orderCode} quá giờ chưa có khách lấy`
      : `Đơn #${order.orderCode} đang chờ bạn đến lấy`,
    body: forStaff
      ? `Đơn mang về của khách ${order.customerName} (${order.customerPhone}) đã nấu xong nhưng quá giờ hẹn ${order.pickupTime}.`
      : `Món ăn của bạn tại ${branchName} đã sẵn sàng và qua giờ hẹn ${order.pickupTime}. Vui lòng ghé nhận sớm để món còn ngon nhé!`,
    link: forStaff
      ? `/staff/pickup-orders?code=${encodeURIComponent(order.orderCode)}`
      : `/profile?tab=pickup-orders&code=${encodeURIComponent(order.orderCode)}`,
    data: {
      pickupOrderId: order.id,
      orderCode: order.orderCode,
      branchId: order.branchId,
      pickupTime: order.pickupTime,
    },
  };
}

// ==========================================
// 3. BẾP & PHỤC VỤ TẠI BÀN (KITCHEN & DINE-IN)
// ==========================================

export function buildKitchenNewBatchNotification(params: {
  branchId: string;
  tableId: string;
  tableNumber: string;
  batchNumber: number;
  itemCount: number;
  invoiceCode?: string;
}): BuiltNotificationPayload {
  return {
    branchId: params.branchId,
    type: NotificationType.KITCHEN_NEW_BATCH,
    category: 'KITCHEN',
    title: `Bàn ${params.tableNumber} gọi món mới (Đợt #${params.batchNumber})`,
    body: `Có ${params.itemCount} món mới vừa được gửi xuống bếp từ Bàn ${params.tableNumber}.`,
    link: '/kitchen',
    data: {
      branchId: params.branchId,
      tableId: params.tableId,
      tableNumber: params.tableNumber,
      batchNumber: params.batchNumber,
      itemCount: params.itemCount,
      invoiceCode: params.invoiceCode || null,
    },
  };
}

export function buildStaffKitchenItemReadyNotification(params: {
  branchId: string;
  tableId: string;
  tableNumber: string;
  itemName?: string;
  batchNumber?: number;
}): BuiltNotificationPayload {
  const detail = params.itemName
    ? `Món "${params.itemName}" tại Bàn ${params.tableNumber} đã nấu xong`
    : `Đợt #${params.batchNumber || 1} tại Bàn ${params.tableNumber} đã hoàn tất`;

  return {
    branchId: params.branchId,
    type: NotificationType.KITCHEN_ITEM_READY,
    category: 'KITCHEN',
    title: `Bàn ${params.tableNumber} có món sẵn sàng phục vụ!`,
    body: `${detail}. Nhân viên vui lòng kiểm tra và bưng món ra cho khách.`,
    link: `/staff/table-turnover?table=${encodeURIComponent(params.tableId)}`,
    data: {
      branchId: params.branchId,
      tableId: params.tableId,
      tableNumber: params.tableNumber,
      itemName: params.itemName || null,
      batchNumber: params.batchNumber || null,
    },
  };
}

export function buildStaffKitchenItemCancelledNotification(params: {
  branchId: string;
  tableId: string;
  tableNumber: string;
  itemName: string;
  reason?: string;
}): BuiltNotificationPayload {
  const reasonSuffix = params.reason ? ` — Lý do: ${params.reason}` : '';
  return {
    branchId: params.branchId,
    type: NotificationType.KITCHEN_ITEM_CANCELLED,
    category: 'KITCHEN',
    title: `Bếp báo hết/hủy món ở Bàn ${params.tableNumber}`,
    body: `Món "${params.itemName}" tại Bàn ${params.tableNumber} đã bị bếp hủy${reasonSuffix}.`,
    link: `/staff/table-turnover?table=${encodeURIComponent(params.tableId)}`,
    data: {
      branchId: params.branchId,
      tableId: params.tableId,
      tableNumber: params.tableNumber,
      itemName: params.itemName,
      reason: params.reason || null,
    },
  };
}

export function buildStaffTablePaymentRequestedNotification(params: {
  branchId: string;
  tableId: string;
  tableNumber: string;
  invoiceId: string;
  invoiceCode: string;
  finalAmount: number;
}): BuiltNotificationPayload {
  return {
    branchId: params.branchId,
    type: NotificationType.TABLE_PAYMENT_REQUESTED,
    category: 'KITCHEN',
    title: `Bàn ${params.tableNumber} yêu cầu thanh toán!`,
    body: `Khách tại Bàn ${params.tableNumber} (Hóa đơn ${params.invoiceCode} · ${formatCurrency(params.finalAmount)}) vừa bấm yêu cầu thanh toán.`,
    link: `/staff/table-turnover?table=${encodeURIComponent(params.tableId)}`,
    data: {
      branchId: params.branchId,
      tableId: params.tableId,
      tableNumber: params.tableNumber,
      invoiceId: params.invoiceId,
      invoiceCode: params.invoiceCode,
      finalAmount: params.finalAmount,
    },
  };
}

export function buildStaffTableDirtyOverdueNotification(params: {
  branchId: string;
  tableId: string;
  tableNumber: string;
  minutesDirty: number;
}): BuiltNotificationPayload {
  return {
    branchId: params.branchId,
    type: NotificationType.TABLE_DIRTY_OVERDUE,
    category: 'KITCHEN',
    title: `Bàn ${params.tableNumber} chờ dọn đã quá ${params.minutesDirty} phút`,
    body: `Bàn ${params.tableNumber} đang ở trạng thái Cần dọn dẹp hơn ${params.minutesDirty} phút. Vui lòng dọn bàn để đón lượt khách tiếp theo.`,
    link: `/staff/table-turnover?table=${encodeURIComponent(params.tableId)}`,
    data: {
      branchId: params.branchId,
      tableId: params.tableId,
      tableNumber: params.tableNumber,
      minutesDirty: params.minutesDirty,
    },
  };
}

// ==========================================
// 4. THANH TOÁN & HOÀN TIỀN (PAYMENTS)
// ==========================================

export function buildCustomerPaymentFailedNotification(params: {
  branchId?: string | null;
  transactionCode: string;
  amount: number;
  targetCode?: string | null;
  targetType: 'RESERVATION' | 'PICKUP';
  reason?: string | null;
}): BuiltNotificationPayload {
  const link =
    params.targetType === 'PICKUP'
      ? `/profile?tab=pickup-orders${params.targetCode ? `&code=${encodeURIComponent(params.targetCode)}` : ''}`
      : `/profile?tab=reservations${params.targetCode ? `&code=${encodeURIComponent(params.targetCode)}` : ''}`;

  return {
    branchId: params.branchId || null,
    type: NotificationType.PAYMENT_FAILED,
    category: 'PAYMENT',
    title: `Thanh toán ${params.transactionCode} không thành công`,
    body:
      params.reason ||
      `Giao dịch ${formatCurrency(params.amount)} cho ${params.targetType === 'PICKUP' ? 'đơn mang về' : 'đơn đặt bàn'} ${params.targetCode || ''} chưa hoàn tất.`,
    link,
    data: {
      transactionCode: params.transactionCode,
      amount: params.amount,
      targetCode: params.targetCode || null,
      targetType: params.targetType,
    },
  };
}

export function buildCustomerPaymentRefundedNotification(params: {
  branchId?: string | null;
  amount: number;
  targetCode?: string | null;
  targetType: 'RESERVATION' | 'PICKUP';
  reason?: string | null;
}): BuiltNotificationPayload {
  const link =
    params.targetType === 'PICKUP'
      ? `/profile?tab=pickup-orders${params.targetCode ? `&code=${encodeURIComponent(params.targetCode)}` : ''}`
      : `/profile?tab=reservations${params.targetCode ? `&code=${encodeURIComponent(params.targetCode)}` : ''}`;

  return {
    branchId: params.branchId || null,
    type: NotificationType.PAYMENT_REFUNDED,
    category: 'PAYMENT',
    title: `Đã ghi nhận hoàn tiền ${formatCurrency(params.amount)}`,
    body: `Giao dịch thanh toán cho ${params.targetType === 'PICKUP' ? 'đơn mang về' : 'đơn đặt bàn'} ${params.targetCode || ''} đã được chuyển trạng thái hoàn tiền${params.reason ? ` (${params.reason})` : ''}.`,
    link,
    data: {
      amount: params.amount,
      targetCode: params.targetCode || null,
      targetType: params.targetType,
      reason: params.reason || null,
    },
  };
}

// ==========================================
// 5. ĐĂNG NHẬP & BẢO MẬT (AUTH / SECURITY)
// ==========================================

export function buildAuthWelcomeNotification(fullName: string): BuiltNotificationPayload {
  return {
    branchId: null,
    type: NotificationType.AUTH_WELCOME,
    category: 'SECURITY',
    title: `Chào mừng ${fullName} gia nhập FoodHub!`,
    body: `Tài khoản của bạn đã sẵn sàng. Chúc bạn có những trải nghiệm ẩm thực tuyệt vời cùng hệ thống nhà hàng FoodHub.`,
    link: '/profile',
    data: { fullName },
  };
}

export function buildAuthDailyLoginNotification(params: {
  fullName: string;
  role: string;
  dateStr: string;
}): BuiltNotificationPayload {
  const isStaffSide = params.role !== 'USER';
  return {
    branchId: null,
    type: NotificationType.AUTH_DAILY_LOGIN,
    category: 'SECURITY',
    title: isStaffSide
      ? `Xin chào ${params.fullName} — Sẵn sàng ca làm việc!`
      : `Chào mừng ${params.fullName} trở lại FoodHub!`,
    body: isStaffSide
      ? `Bạn đã đăng nhập hệ thống ngày ${formatViDate(params.dateStr)}. Chuông cảnh báo thời gian thực đã sẵn sàng.`
      : `Chúc bạn một ngày tốt lành! Hãy khám phá thực đơn hôm nay hoặc đặt bàn trước để có chỗ ngồi ưng ý nhất.`,
    link:
      params.role === 'STAFF'
        ? '/staff/reservations'
        : params.role === 'KITCHEN'
          ? '/kitchen'
          : params.role === 'ADMIN'
            ? '/admin'
            : '/menu',
    data: {
      date: params.dateStr,
      role: params.role,
    },
  };
}

export function buildAuthNewDeviceLoginNotification(params: {
  deviceSummary: string;
  maskedIp: string;
  timeStr: string;
}): BuiltNotificationPayload {
  return {
    branchId: null,
    type: NotificationType.AUTH_NEW_DEVICE_LOGIN,
    category: 'SECURITY',
    title: `Phát hiện đăng nhập từ thiết bị mới`,
    body: `Tài khoản vừa đăng nhập từ ${params.deviceSummary} (IP: ${params.maskedIp}) lúc ${params.timeStr}. Nếu không phải bạn, hãy đổi mật khẩu ngay.`,
    link: '/profile',
    data: {
      deviceSummary: params.deviceSummary,
      maskedIp: params.maskedIp,
      timeStr: params.timeStr,
    },
  };
}

export function buildAuthPasswordChangedNotification(): BuiltNotificationPayload {
  return {
    branchId: null,
    type: NotificationType.AUTH_PASSWORD_CHANGED,
    category: 'SECURITY',
    title: `Mật khẩu tài khoản vừa được thay đổi`,
    body: `Mật khẩu đăng nhập của bạn đã được cập nhật thành công và toàn bộ phiên đăng nhập cũ đã được đăng xuất.`,
    link: '/profile',
    data: {},
  };
}

export function buildAuthSessionsRevokedNotification(): BuiltNotificationPayload {
  return {
    branchId: null,
    type: NotificationType.AUTH_SESSIONS_REVOKED,
    category: 'SECURITY',
    title: `Cảnh báo: Phiên đăng nhập đã bị thu hồi`,
    body: `Hệ thống phát hiện dấu hiệu dùng lại phiên cũ và đã tự động đăng xuất toàn bộ thiết bị để bảo vệ tài khoản của bạn.`,
    link: '/profile',
    data: {},
  };
}

// ==========================================
// 6. QUẢN LÝ NHÂN VIÊN & ADMIN SYSTEM
// ==========================================

export function buildStaffAccountCreatedNotification(
  fullName: string,
  branchName: string,
  branchId: string,
): BuiltNotificationPayload {
  return {
    branchId,
    type: NotificationType.STAFF_ACCOUNT_CREATED,
    category: 'ACCOUNT',
    title: `Tài khoản nhân viên đã được khởi tạo`,
    body: `Xin chào ${fullName}, tài khoản của bạn đã được phân công làm việc tại chi nhánh ${branchName}.`,
    link: '/staff/reservations',
    data: { fullName, branchName, branchId },
  };
}

export function buildStaffBranchTransferredNotification(
  branchName: string,
  branchId: string,
): BuiltNotificationPayload {
  return {
    branchId,
    type: NotificationType.STAFF_BRANCH_TRANSFERRED,
    category: 'ACCOUNT',
    title: `Bạn vừa được điều chuyển chi nhánh làm việc`,
    body: `Quản trị viên đã cập nhật cơ sở làm việc của bạn sang chi nhánh ${branchName}.`,
    link: '/staff/reservations',
    data: { branchName, branchId },
  };
}

export function buildStaffAccountStatusNotification(
  isActive: boolean,
): BuiltNotificationPayload {
  return {
    branchId: null,
    type: isActive
      ? NotificationType.STAFF_ACCOUNT_UNLOCKED
      : NotificationType.STAFF_ACCOUNT_LOCKED,
    category: 'ACCOUNT',
    title: isActive
      ? `Tài khoản nhân viên đã được kích hoạt lại`
      : `Tài khoản nhân viên đã bị tạm khóa`,
    body: isActive
      ? `Quản trị viên đã mở khóa tài khoản làm việc của bạn.`
      : `Tài khoản của bạn đã bị tạm ngưng hoạt động bởi quản trị viên.`,
    link: '/staff/reservations',
    data: { isActive },
  };
}

export function buildStaffPasswordResetNotification(): BuiltNotificationPayload {
  return {
    branchId: null,
    type: NotificationType.STAFF_PASSWORD_RESET,
    category: 'ACCOUNT',
    title: `Mật khẩu tài khoản đã được đặt lại`,
    body: `Quản trị viên vừa đặt lại mật khẩu đăng nhập mới cho tài khoản nhân viên của bạn.`,
    link: '/staff/reservations',
    data: {},
  };
}

export function buildAdminSystemAlertNotification(params: {
  title: string;
  body: string;
  branchId?: string | null;
  link?: string | null;
  data?: Prisma.InputJsonObject;
}): BuiltNotificationPayload {
  return {
    branchId: params.branchId || null,
    type: NotificationType.ADMIN_SYSTEM_ALERT,
    category: 'SYSTEM',
    title: params.title,
    body: params.body,
    link: params.link || '/admin',
    data: params.data || {},
  };
}
