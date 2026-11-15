import {
  InvoiceStatus,
  KitchenItemStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';

export const RESERVATION_PAYMENT_SUMMARY_SELECT = {
  id: true,
  transactionCode: true,
  provider: true,
  purpose: true,
  status: true,
  amount: true,
  paidAt: true,
  refundedAt: true,
  refundReason: true,
  createdAt: true,
} as const;

export const RESERVATION_INVOICES_BILL_INCLUDE = {
  where: { status: { not: InvoiceStatus.CANCELLED } },
  orderBy: { createdAt: 'desc' as const },
  take: 1,
  include: {
    batches: {
      orderBy: { batchNumber: 'asc' as const },
      include: {
        items: {
          include: {
            menuItem: { select: { id: true, name: true, imageUrl: true } },
          },
          orderBy: { createdAt: 'asc' as const },
        },
      },
    },
  },
} as const;

export const RESERVATION_LIST_INCLUDE = {
  branch: { select: { id: true, name: true, phone: true, streetAddress: true } },
  tableType: true,
  table: true,
  orders: { include: { menuItem: true } },
  invoices: RESERVATION_INVOICES_BILL_INCLUDE,
  payments: {
    select: RESERVATION_PAYMENT_SUMMARY_SELECT,
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ReservationInclude;

export const RESERVATION_BILL_INCLUDE = {
  branch: { select: { id: true, name: true, phone: true, streetAddress: true, address: true } },
  table: { select: { id: true, tableNumber: true, floor: true } },
  orders: {
    include: {
      menuItem: { select: { id: true, name: true, imageUrl: true } },
    },
  },
  invoices: RESERVATION_INVOICES_BILL_INCLUDE,
  payments: {
    orderBy: { createdAt: 'desc' as const },
    select: RESERVATION_PAYMENT_SUMMARY_SELECT,
  },
  user: { select: { id: true, fullName: true, email: true, phone: true } },
} satisfies Prisma.ReservationInclude;

export interface ReservationBillItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  note: string | null;
  imageUrl: string | null;
  batchNumber?: number;
  status?: KitchenItemStatus;
}

interface BillOrderLike {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: unknown;
  note?: string | null;
  menuItem?: { name?: string | null; imageUrl?: string | null } | null;
}

interface BillInvoiceItemLike {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: unknown;
  subtotal?: unknown;
  status?: KitchenItemStatus;
  note?: string | null;
  menuItem?: { name?: string | null; imageUrl?: string | null } | null;
}

interface BillInvoiceBatchLike {
  batchNumber?: number;
  items?: BillInvoiceItemLike[];
}

export interface BillInvoiceLike {
  id?: string;
  invoiceCode?: string;
  discountAmount?: unknown;
  batches?: BillInvoiceBatchLike[];
}

interface BillPaymentLike {
  purpose: PaymentPurpose;
  status?: PaymentStatus;
  amount: unknown;
}

export interface BillReservationSource {
  id?: string;
  reservationCode?: string;
  status?: ReservationStatus;
  orders?: BillOrderLike[];
  invoices?: BillInvoiceLike[];
  payments?: BillPaymentLike[];
}

export function computeBatchesFoodTotal(batches: BillInvoiceBatchLike[] | undefined): number {
  if (!Array.isArray(batches) || batches.length === 0) {
    return 0;
  }

  let total = 0;
  for (const batch of batches) {
    for (const item of batch.items || []) {
      if (item.status === KitchenItemStatus.CANCELLED) {
        continue;
      }
      const unitPrice = Number(item.unitPrice);
      const itemSubtotal = item.subtotal != null ? Number(item.subtotal) : unitPrice * item.quantity;
      total += itemSubtotal;
    }
  }
  return total;
}

export function computeReservationBillBreakdown(reservation: BillReservationSource) {
  const latestInvoice = reservation.invoices?.[0] ?? null;
  const invoiceBatches = latestInvoice?.batches ?? [];
  const hasInvoiceBatches = Array.isArray(invoiceBatches) && invoiceBatches.length > 0;

  const items: ReservationBillItem[] = hasInvoiceBatches
    ? invoiceBatches.flatMap((batch) =>
        (batch.items || [])
          .filter((item) => item.status !== KitchenItemStatus.CANCELLED)
          .map((item) => {
            const unitPrice = Number(item.unitPrice);
            const subtotal =
              item.subtotal != null ? Number(item.subtotal) : unitPrice * item.quantity;
            return {
              id: item.id,
              menuItemId: item.menuItemId,
              name: item.menuItem?.name || 'Món ăn',
              quantity: item.quantity,
              unitPrice,
              subtotal,
              note: item.note || null,
              imageUrl: item.menuItem?.imageUrl || null,
              batchNumber: batch.batchNumber,
              status: item.status,
            };
          }),
      )
    : (reservation.orders || []).map((order) => {
        const unitPrice = Number(order.unitPrice);
        const subtotal = unitPrice * order.quantity;
        return {
          id: order.id,
          menuItemId: order.menuItemId,
          name: order.menuItem?.name || 'Món ăn',
          quantity: order.quantity,
          unitPrice,
          subtotal,
          note: order.note || null,
          imageUrl: order.menuItem?.imageUrl || null,
        };
      });

  const totalFoodAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = Number(latestInvoice?.discountAmount || 0);

  const successPayments = (reservation.payments || []).filter(
    (payment) => !payment.status || payment.status === PaymentStatus.SUCCESS,
  );

  const depositAmount = successPayments
    .filter((payment) => payment.purpose === PaymentPurpose.RESERVATION_DEPOSIT)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const settlementAmount = successPayments
    .filter((payment) => payment.purpose === PaymentPurpose.RESERVATION_SETTLEMENT)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const remainingAmount = Math.max(
    0,
    totalFoodAmount - discountAmount - depositAmount - settlementAmount,
  );
  const isSettled = remainingAmount === 0 || reservation.status === ReservationStatus.COMPLETED;

  return {
    activeInvoiceId: latestInvoice?.id || null,
    activeInvoiceCode: latestInvoice?.invoiceCode || null,
    items,
    totalFoodAmount,
    discountAmount,
    depositAmount,
    settlementAmount,
    remainingAmount,
    isSettled,
  };
}

export function formatPaymentProviderLabel(provider: string): string {
  if (provider === PaymentProvider.MOMO) return 'Ví MoMo';
  if (provider === PaymentProvider.VNPAY) return 'Cổng VNPay';
  return 'Tiền mặt tại quầy';
}

export function buildReservationInvoiceMailPayload(params: {
  customerName: string;
  reservationCode: string;
  reservationDate: Date | string;
  reservationTime: string;
  branch?: {
    name?: string | null;
    streetAddress?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
  table?: { tableNumber?: string | null; floor?: number | null } | null;
  items: ReservationBillItem[];
  totalFoodAmount: number;
  depositAmount: number;
  settlementAmount: number;
  provider: string;
  transactionCode: string;
}) {
  const dateStr =
    params.reservationDate instanceof Date
      ? params.reservationDate.toISOString().slice(0, 10)
      : String(params.reservationDate).slice(0, 10);

  return {
    customerName: params.customerName,
    reservationCode: params.reservationCode,
    branchName: params.branch?.name || 'FoodHub Restaurant',
    branchAddress: params.branch?.streetAddress || params.branch?.address || null,
    branchPhone: params.branch?.phone || null,
    reservationDate: dateStr,
    reservationTime: params.reservationTime,
    tableName: params.table?.tableNumber || null,
    floor: params.table?.floor ?? null,
    items: params.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    totalFoodAmount: params.totalFoodAmount,
    depositAmount: params.depositAmount,
    settlementAmount: params.settlementAmount,
    paymentMethod: formatPaymentProviderLabel(params.provider),
    transactionCode: params.transactionCode,
  };
}
