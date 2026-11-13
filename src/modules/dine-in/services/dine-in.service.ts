import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TablesGateway } from 'src/gateway/tables.gateway';
import {
  InvoiceStatus,
  KitchenItemStatus,
  Prisma,
  ReservationStatus,
  RestaurantTableStatus,
  Role,
} from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { CreateOrderBatchDto } from '../dtos/create-order-batch.dto';
import { CheckoutInvoiceDto } from '../dtos/checkout-invoice.dto';
import { OpenTableSessionDto } from '../dtos/open-table-session.dto';
import { generateInvoiceCode, getLocalNow, toDateOnly } from '../helpers/dine-in.helper';

@Injectable()
export class DineInService {
  private readonly logger = new Logger(DineInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tablesGateway: TablesGateway,
  ) {}

  /**
   * Khách hoặc phục vụ quét QR tại bàn:
   * Trả về thông tin bàn, phiên ăn/hóa đơn hiện hành và danh sách món của chi nhánh.
   */
  async getTableSession(tableId: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: tableId },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            streetAddress: true,
            phone: true,
            status: true,
            openingTime: true,
            closingTime: true,
          },
        },
        tableType: true,
      },
    });

    if (!table || !table.isActive) {
      throw new NotFoundException('Bàn ăn không tồn tại hoặc đã ngừng hoạt động.');
    }

    const now = getLocalNow();
    const today = toDateOnly(now.date);

    // 1. Tìm hóa đơn đang mở trên bàn
    let activeInvoice = await this.prisma.invoice.findFirst({
      where: {
        tableId,
        status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAYMENT_PENDING] },
      },
      include: {
        batches: {
          orderBy: { batchNumber: 'asc' },
          include: {
            items: {
              include: {
                menuItem: {
                  select: { id: true, name: true, price: true, imageUrl: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        reservation: {
          select: {
            id: true,
            reservationCode: true,
            customerName: true,
            customerPhone: true,
            reservationTime: true,
            guestCount: true,
          },
        },
      },
    });

    // 2. Nếu chưa có hóa đơn mở nhưng bàn đang có lượt khách SEATED hôm nay -> tự động mở hóa đơn
    if (!activeInvoice) {
      const seatedReservation = await this.prisma.reservation.findFirst({
        where: {
          tableId,
          reservationDate: today,
          status: ReservationStatus.SEATED,
        },
        include: {
          orders: {
            include: { menuItem: true },
          },
        },
      });

      if (seatedReservation) {
        activeInvoice = await this.createInvoiceForSeatedReservation(table, seatedReservation);
      }
    }

    // 3. Lấy thực đơn chi nhánh đang hoạt động
    const branchMenuItems = await this.prisma.branchMenuItem.findMany({
      where: {
        branchId: table.branchId,
        isActive: true,
        isAvailable: true,
      },
      include: {
        menuItem: {
          include: { category: true },
        },
      },
      orderBy: {
        menuItem: { name: 'asc' },
      },
    });

    const menu = branchMenuItems.map((bmi) => {
      const price = bmi.priceOverride !== null ? Number(bmi.priceOverride) : Number(bmi.menuItem.price);
      return {
        id: bmi.menuItemId,
        name: bmi.menuItem.name,
        description: bmi.menuItem.description,
        price,
        originalPrice: bmi.menuItem.originalPrice ? Number(bmi.menuItem.originalPrice) : null,
        imageUrl: bmi.menuItem.imageUrl,
        isFeatured: bmi.menuItem.isFeatured,
        preparationTime: bmi.menuItem.preparationTime,
        category: bmi.menuItem.category,
      };
    });

    return {
      table: {
        id: table.id,
        tableNumber: table.tableNumber,
        floor: table.floor,
        status: table.status,
        capacity: table.tableType?.capacity,
        tableTypeName: table.tableType?.name,
        branch: table.branch,
      },
      activeInvoice: activeInvoice || null,
      menu,
    };
  }

  /**
   * Mở phiên ăn mới (Invoice) cho bàn (dành cho khách vãng lai hoặc phục vụ mở bàn chủ động)
   */
  async openTableSession(tableId: string, dto: OpenTableSessionDto, user?: ICurrentUser) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: tableId },
      include: { branch: true },
    });

    if (!table || !table.isActive) {
      throw new NotFoundException('Bàn ăn không tồn tại hoặc đã ngừng hoạt động.');
    }

    if (user && user.role === Role.STAFF && user.branchId && table.branchId !== user.branchId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên bàn của chi nhánh khác.');
    }

    // Kiểm tra xem bàn đã có hóa đơn đang mở chưa
    const existing = await this.prisma.invoice.findFirst({
      where: {
        tableId,
        status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAYMENT_PENDING] },
      },
    });

    if (existing) {
      return existing;
    }

    const invoiceCode = generateInvoiceCode();

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceCode,
          branchId: table.branchId,
          tableId,
          reservationId: dto.reservationId || null,
          userId: user?.id || null,
          customerName: dto.customerName?.trim() || 'Khách tại bàn',
          customerPhone: dto.customerPhone?.trim() || null,
          guestCount: dto.guestCount || 1,
          notes: dto.notes?.trim() || null,
          status: InvoiceStatus.OPEN,
        },
        include: {
          table: true,
          branch: true,
        },
      });

      if (table.status === RestaurantTableStatus.AVAILABLE) {
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: {
            status: RestaurantTableStatus.OCCUPIED,
            note: `Khách ${created.customerName} đang ngồi ăn (${invoiceCode})`,
          },
        });
      }

      return created;
    });

    try {
      this.tablesGateway.notifyTableStatusChanged(table.branchId, {
        id: table.id,
        status: RestaurantTableStatus.OCCUPIED,
        tableNumber: table.tableNumber,
        note: `Khách ${invoice.customerName} đang ngồi ăn`,
      });
    } catch {
      // Bỏ qua lỗi socket
    }

    return invoice;
  }

  /**
   * Gửi đợt gọi món mới vào bàn (Khách tự gọi qua QR hoặc phục vụ gọi giúp)
   */
  async createOrderBatch(
    tableId: string,
    dto: CreateOrderBatchDto,
    user?: ICurrentUser,
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 món ăn.');
    }

    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: tableId },
      include: { branch: true },
    });

    if (!table || !table.isActive) {
      throw new NotFoundException('Bàn ăn không tồn tại hoặc đã ngừng hoạt động.');
    }

    if (user && user.role === Role.STAFF && user.branchId && table.branchId !== user.branchId) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên bàn của chi nhánh khác.');
    }

    // Tìm hóa đơn đang mở, nếu chưa có thì tự động tạo hóa đơn mới
    let invoice = await this.prisma.invoice.findFirst({
      where: {
        tableId,
        status: InvoiceStatus.OPEN,
      },
    });

    if (!invoice) {
      invoice = await this.openTableSession(
        tableId,
        {
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
        },
        user,
      );
    }

    // Kiểm tra tính hợp lệ và lấy giá theo chi nhánh
    const itemIds = dto.items.map((i) => i.menuItemId);
    const branchMenuItems = await this.prisma.branchMenuItem.findMany({
      where: {
        branchId: table.branchId,
        menuItemId: { in: itemIds },
        isActive: true,
        isAvailable: true,
      },
      include: { menuItem: true },
    });

    const priceMap = new Map<string, { unitPrice: number; name: string }>();
    for (const bmi of branchMenuItems) {
      const price = bmi.priceOverride !== null ? Number(bmi.priceOverride) : Number(bmi.menuItem.price);
      priceMap.set(bmi.menuItemId, { unitPrice: price, name: bmi.menuItem.name });
    }

    let batchTotal = 0;
    const orderLines: { menuItemId: string; quantity: number; unitPrice: number; subtotal: number; note?: string | null }[] = [];

    for (const item of dto.items) {
      const itemInfo = priceMap.get(item.menuItemId);
      if (!itemInfo) {
        throw new BadRequestException(
          `Món ăn có ID ${item.menuItemId} không kinh doanh hoặc tạm hết hàng tại chi nhánh này.`,
        );
      }
      const lineSubtotal = itemInfo.unitPrice * item.quantity;
      batchTotal += lineSubtotal;
      orderLines.push({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: itemInfo.unitPrice,
        subtotal: lineSubtotal,
        note: item.note?.trim() || null,
      });
    }

    const orderedByRole = user?.role || Role.USER;

    // Ghi nhận đợt gọi món trong transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const currentBatchesCount = await tx.orderBatch.count({
        where: { invoiceId: invoice.id },
      });

      const nextBatchNumber = currentBatchesCount + 1;

      const batch = await tx.orderBatch.create({
        data: {
          batchNumber: nextBatchNumber,
          invoiceId: invoice.id,
          branchId: table.branchId,
          tableId,
          orderedByRole,
          note: dto.note?.trim() || null,
        },
      });

      await tx.orderItem.createMany({
        data: orderLines.map((line) => ({
          ...line,
          batchId: batch.id,
          status: KitchenItemStatus.QUEUED,
        })),
      });

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal: { increment: batchTotal },
          finalAmount: { increment: batchTotal },
        },
      });

      if (table.status !== RestaurantTableStatus.OCCUPIED) {
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: { status: RestaurantTableStatus.OCCUPIED },
        });
      }

      const fullBatch = await tx.orderBatch.findUnique({
        where: { id: batch.id },
        include: {
          table: { select: { id: true, tableNumber: true, floor: true } },
          items: {
            include: {
              menuItem: { select: { id: true, name: true, imageUrl: true } },
            },
          },
        },
      });

      return {
        batch: fullBatch,
        updatedInvoice,
      };
    });

    // Phát sóng WebSocket thời gian thực:
    // 1. Xuống màn hình Bếp chi nhánh
    try {
      this.tablesGateway.notifyKitchenNewBatch(table.branchId, {
        batch: result.batch,
        table: { id: table.id, tableNumber: table.tableNumber, floor: table.floor },
        invoiceId: invoice.id,
      });

      // 2. Tới kênh bàn ăn của khách
      this.tablesGateway.notifyTableOrderBatchCreated(table.branchId, tableId, {
        batch: result.batch,
        invoice: result.updatedInvoice,
      });

      // 3. Tới kênh nhân viên phục vụ chi nhánh
      this.tablesGateway.notifyTableBillUpdated(table.branchId, tableId, result.updatedInvoice);
    } catch {
      // Bỏ qua lỗi socket
    }

    return result;
  }

  /**
   * Khách tại bàn bấm nút "Yêu cầu thanh toán"
   */
  async requestPayment(tableId: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: tableId },
      include: { branch: true },
    });

    if (!table) {
      throw new NotFoundException('Không tìm thấy bàn ăn.');
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        tableId,
        status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PAYMENT_PENDING] },
      },
    });

    if (!invoice) {
      throw new BadRequestException('Bàn ăn hiện không có hóa đơn nào đang mở để thanh toán.');
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.PAYMENT_PENDING },
      include: {
        table: true,
        batches: { include: { items: { include: { menuItem: true } } } },
      },
    });

    try {
      this.tablesGateway.notifyTablePaymentRequested(table.branchId, tableId, {
        tableId,
        tableNumber: table.tableNumber,
        floor: table.floor,
        invoiceId: invoice.id,
        invoiceCode: invoice.invoiceCode,
        finalAmount: Number(updated.finalAmount),
      });
    } catch {
      // Bỏ qua lỗi socket
    }

    return updated;
  }

  /**
   * Phục vụ/Thu ngân hoàn tất thanh toán hóa đơn bàn ăn:
   * Chốt số tiền, đóng hóa đơn (PAID), chuyển bàn sang Cần dọn dẹp (DIRTY).
   */
  async checkoutInvoice(
    invoiceId: string,
    dto: CheckoutInvoiceDto,
    user: ICurrentUser,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        table: true,
        reservation: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Không tìm thấy hóa đơn cần thanh toán.');
    }

    if (user.role === Role.STAFF && user.branchId && invoice.branchId !== user.branchId) {
      throw new ForbiddenException('Bạn chỉ có quyền thanh toán hóa đơn của chi nhánh mình.');
    }

    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Hóa đơn này đã được thanh toán hoặc đã bị hủy trước đó.');
    }

    const subtotal = Number(invoice.subtotal);
    const discountAmount = dto.discountAmount || 0;
    const finalAmount = Math.max(0, subtotal - discountAmount);

    const updatedInvoice = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.PAID,
          paymentMethod: dto.paymentMethod,
          discountAmount,
          finalAmount,
          notes: dto.notes?.trim() || invoice.notes,
          closedAt: new Date(),
        },
        include: {
          table: true,
          batches: { include: { items: { include: { menuItem: true } } } },
        },
      });

      // Chuyển bàn sang DIRTY để đưa vào hàng chờ dọn
      await tx.restaurantTable.update({
        where: { id: invoice.tableId },
        data: {
          status: RestaurantTableStatus.DIRTY,
          note: `Khách vừa thanh toán xong (${invoice.invoiceCode})`,
        },
      });

      // Nếu hóa đơn này gắn với đơn đặt bàn SEATED -> chuyển đơn đặt bàn sang COMPLETED
      if (invoice.reservationId) {
        await tx.reservation.update({
          where: { id: invoice.reservationId },
          data: { status: ReservationStatus.COMPLETED },
        });
      }

      return inv;
    });

    const dirtySince = Date.now();
    try {
      this.tablesGateway.notifyTableStatusChanged(invoice.branchId, {
        id: invoice.tableId,
        status: RestaurantTableStatus.DIRTY,
        dirtySince,
        tableNumber: invoice.table?.tableNumber,
        note: `Khách vừa thanh toán xong (${invoice.invoiceCode})`,
      });

      this.tablesGateway.notifyTableInvoiceClosed(invoice.branchId, invoice.tableId, {
        invoiceId: updatedInvoice.id,
        invoiceCode: updatedInvoice.invoiceCode,
        finalAmount,
      });
    } catch {
      // Bỏ qua lỗi socket
    }

    return updatedInvoice;
  }

  async getInvoiceById(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        table: true,
        branch: true,
        batches: {
          orderBy: { batchNumber: 'asc' },
          include: {
            items: {
              include: { menuItem: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        reservation: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Không tìm thấy hóa đơn.');
    }

    return invoice;
  }

  /**
   * Helper nội bộ: Tự động tạo Invoice cho đơn đặt bàn SEATED nếu khách chưa có Invoice
   */
  private async createInvoiceForSeatedReservation(
    table: { id: string; branchId: string },
    reservation: {
      id: string;
      userId?: string | null;
      customerName: string;
      customerPhone?: string | null;
      guestCount: number;
      orders?: Array<{
        menuItemId: string;
        quantity: number;
        unitPrice: Prisma.Decimal | number;
        note?: string | null;
      }>;
    },
  ) {
    const invoiceCode = generateInvoiceCode();

    let preOrderSubtotal = 0;
    const ordersList = reservation.orders || [];
    const preOrderItems = ordersList.map((o) => {
      const price = Number(o.unitPrice);
      const subtotal = price * o.quantity;
      preOrderSubtotal += subtotal;
      return {
        menuItemId: o.menuItemId,
        quantity: o.quantity,
        unitPrice: price,
        subtotal,
        note: o.note || 'Món đặt trước khi giữ chỗ',
      };
    });

    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceCode,
          branchId: table.branchId,
          tableId: table.id,
          reservationId: reservation.id,
          userId: reservation.userId || null,
          customerName: reservation.customerName,
          customerPhone: reservation.customerPhone,
          guestCount: reservation.guestCount,
          subtotal: preOrderSubtotal,
          finalAmount: preOrderSubtotal,
          status: InvoiceStatus.OPEN,
        },
      });

      if (preOrderItems.length > 0) {
        const batch = await tx.orderBatch.create({
          data: {
            batchNumber: 1,
            invoiceId: inv.id,
            branchId: table.branchId,
            tableId: table.id,
            orderedByRole: Role.USER,
            note: 'Đợt 1 (Món đặt trước)',
          },
        });

        await tx.orderItem.createMany({
          data: preOrderItems.map((item) => ({
            ...item,
            batchId: batch.id,
            status: KitchenItemStatus.QUEUED,
          })),
        });
      }

      return tx.invoice.findUnique({
        where: { id: inv.id },
        include: {
          batches: {
            include: {
              items: { include: { menuItem: true } },
            },
          },
          reservation: true,
        },
      });
    });
  }
}
