import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TablesGateway } from 'src/gateway/tables.gateway';
import { CreatePickupOrderDto } from '../dtos/create-pickup-order.dto';
import { QueryPickupOrderDto } from '../dtos/query-pickup-order.dto';
import { UpdatePickupOrderStatusDto } from '../dtos/update-pickup-order-status.dto';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import { PaginationQueryDto } from 'src/core/dto/pagination-query.dto';
import { PickupOrderStatus, Prisma, Role } from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import {
  generatePickupCode,
  getLocalNow,
  MIN_PICKUP_LEAD_TIME_MINUTES,
  timeStringToMinutes,
  toDateOnly,
} from '../helpers/pickup-order.helper';

@Injectable()
export class PickupOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tablesGateway: TablesGateway,
  ) {}

  async createPickupOrder(dto: CreatePickupOrderDto, user?: ICurrentUser) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
      include: { operatingHours: true },
    });

    if (!branch || branch.status !== 'ACTIVE') {
      throw new BadRequestException('Chi nhánh không tồn tại hoặc đang tạm ngưng hoạt động.');
    }

    const orderDate = toDateOnly(dto.pickupDate);
    const now = getLocalNow();
    const today = toDateOnly(now.date);

    if (orderDate.getTime() < today.getTime()) {
      throw new BadRequestException('Không thể đặt món mang về cho ngày trong quá khứ.');
    }

    // Kiểm tra giờ hoạt động của chi nhánh
    const dayOfWeek = new Date(dto.pickupDate).getUTCDay();
    const opHour = branch.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);
    const isOpen = opHour ? opHour.isOpen : true;
    const openTime = opHour ? opHour.openTime : branch.openingTime || '08:00';
    const closeTime = opHour ? opHour.closeTime : branch.closingTime || '22:00';

    if (!isOpen) {
      throw new BadRequestException('Chi nhánh không mở cửa phục vụ vào ngày đã chọn.');
    }

    const reqMins = timeStringToMinutes(dto.pickupTime);
    const openMins = timeStringToMinutes(openTime);
    const closeMins = timeStringToMinutes(closeTime);

    if (reqMins < openMins || reqMins > closeMins) {
      throw new BadRequestException(
        `Giờ hẹn lấy (${dto.pickupTime}) nằm ngoài giờ mở cửa của chi nhánh (${openTime} - ${closeTime}).`,
      );
    }

    // Nếu đặt trong ngày hôm nay: phải đặt trước giờ lấy tối thiểu 20 phút
    if (orderDate.getTime() === today.getTime()) {
      if (reqMins < now.minutes + MIN_PICKUP_LEAD_TIME_MINUTES) {
        throw new BadRequestException(
          `Vui lòng đặt trước ít nhất ${MIN_PICKUP_LEAD_TIME_MINUTES} phút so với giờ hẹn ghé lấy món.`,
        );
      }
    }

    // Kiểm tra món ăn và tính giá theo chi nhánh
    const itemIds = dto.items.map((i) => i.menuItemId);
    const branchMenuItems = await this.prisma.branchMenuItem.findMany({
      where: {
        branchId: dto.branchId,
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

    let totalAmount = 0;
    const orderLines: { menuItemId: string; quantity: number; unitPrice: number; subtotal: number; note?: string }[] = [];

    for (const item of dto.items) {
      const itemInfo = priceMap.get(item.menuItemId);
      if (!itemInfo) {
        throw new BadRequestException(
          `Món ăn có ID ${item.menuItemId} không kinh doanh hoặc tạm hết hàng tại chi nhánh này.`,
        );
      }
      const subtotal = itemInfo.unitPrice * item.quantity;
      totalAmount += subtotal;
      orderLines.push({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: itemInfo.unitPrice,
        subtotal,
        note: item.note,
      });
    }

    const orderCode = generatePickupCode(dto.pickupDate);
    const phone = dto.customerPhone.trim();

    const createdOrder = await this.prisma.$transaction(async (tx) => {
      const order = await tx.pickupOrder.create({
        data: {
          orderCode,
          branchId: dto.branchId,
          userId: user?.id || null,
          customerName: dto.customerName.trim(),
          customerPhone: phone,
          customerEmail: dto.customerEmail?.trim() || null,
          pickupDate: orderDate,
          pickupTime: dto.pickupTime,
          totalAmount,
          specialNotes: dto.specialNotes?.trim() || null,
          status: PickupOrderStatus.PENDING,
        },
      });

      await tx.pickupOrderItem.createMany({
        data: orderLines.map((line) => ({
          ...line,
          orderId: order.id,
        })),
      });

      return tx.pickupOrder.findUnique({
        where: { id: order.id },
        include: {
          branch: { select: { id: true, name: true, phone: true, streetAddress: true } },
          items: { include: { menuItem: true } },
        },
      });
    });

    // Phát sóng WebSocket thông báo cho chi nhánh có đơn mang về mới
    try {
      this.tablesGateway.server?.to(`branch:${dto.branchId}`).emit('pickupOrder:created', createdOrder);
    } catch {
      // Bỏ qua lỗi socket nếu có
    }

    return createdOrder;
  }

  async getPickupOrders(query: QueryPickupOrderDto, user?: ICurrentUser) {
    const where: Prisma.PickupOrderWhereInput = {};

    if (user && user.role === Role.STAFF) {
      if (user.branchId) {
        where.branchId = user.branchId;
      }
    } else if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { orderCode: { contains: term, mode: 'insensitive' } },
        { customerName: { contains: term, mode: 'insensitive' } },
        { customerPhone: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.fromDate || query.toDate) {
      where.pickupDate = {};
      if (query.fromDate) {
        where.pickupDate.gte = toDateOnly(query.fromDate);
      }
      if (query.toDate) {
        where.pickupDate.lte = toDateOnly(query.toDate);
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      this.prisma.pickupOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ pickupDate: 'desc' }, { pickupTime: 'desc' }],
        include: {
          branch: { select: { id: true, name: true, phone: true, streetAddress: true } },
          items: { include: { menuItem: true } },
        },
      }),
      this.prisma.pickupOrder.count({ where }),
    ]);

    return {
      items,
      meta: new PaginationMetaDto(page, limit, totalItems),
    };
  }

  async getMyPickupOrders(user: ICurrentUser, query: PaginationQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.PickupOrderWhereInput = {
      userId: user.id,
    };

    const [items, totalItems] = await Promise.all([
      this.prisma.pickupOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ pickupDate: 'desc' }, { pickupTime: 'desc' }],
        include: {
          branch: { select: { id: true, name: true, phone: true, streetAddress: true } },
          items: { include: { menuItem: true } },
        },
      }),
      this.prisma.pickupOrder.count({ where }),
    ]);

    const enriched = items.map((order) => {
      const qrPayload = JSON.stringify({
        type: 'PICKUP',
        code: order.orderCode,
        branchId: order.branchId,
        date: order.pickupDate.toISOString().split('T')[0],
        time: order.pickupTime,
        phone: order.customerPhone,
        name: order.customerName,
      });

      const canCancel =
        order.status === PickupOrderStatus.PENDING || order.status === PickupOrderStatus.CONFIRMED;

      return {
        ...order,
        qrPayload,
        canCancel,
      };
    });

    return {
      items: enriched,
      meta: new PaginationMetaDto(page, limit, totalItems),
    };
  }

  async getPickupOrderById(id: string, user?: ICurrentUser) {
    const order = await this.prisma.pickupOrder.findFirst({
      where: {
        OR: [{ id: id.includes('-') && id.length === 36 ? id : undefined }, { orderCode: id }],
      },
      include: {
        branch: true,
        items: { include: { menuItem: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy thông tin đơn hàng mang về.');
    }

    if (user && user.role === Role.USER && order.userId && order.userId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền xem thông tin đơn hàng này.');
    }

    return order;
  }

  async cancelPickupOrder(id: string, reason?: string, user?: ICurrentUser) {
    const order = await this.getPickupOrderById(id, user);

    if (user && user.role === Role.USER && order.userId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền hủy đơn hàng này.');
    }

    if (
      order.status === PickupOrderStatus.READY ||
      order.status === PickupOrderStatus.COMPLETED ||
      order.status === PickupOrderStatus.CANCELLED
    ) {
      throw new BadRequestException('Không thể hủy đơn hàng ở trạng thái hiện tại.');
    }

    const updated = await this.prisma.pickupOrder.update({
      where: { id: order.id },
      data: {
        status: PickupOrderStatus.CANCELLED,
        cancelledReason: reason || (user?.role === Role.USER ? 'Khách yêu cầu hủy đơn' : 'Nhà hàng hủy đơn'),
      },
      include: {
        branch: true,
        items: { include: { menuItem: true } },
      },
    });

    try {
      this.tablesGateway.server?.to(`branch:${order.branchId}`).emit('pickupOrder:statusChanged', updated);
    } catch {
      // Bỏ qua lỗi socket
    }

    return updated;
  }

  async updatePickupOrderStatus(
    id: string,
    dto: UpdatePickupOrderStatusDto,
    user: ICurrentUser,
  ) {
    const order = await this.getPickupOrderById(id, user);

    if (user.role === Role.STAFF && user.branchId && order.branchId !== user.branchId) {
      throw new ForbiddenException('Bạn chỉ có quyền cập nhật đơn hàng thuộc chi nhánh của mình.');
    }

    const updated = await this.prisma.pickupOrder.update({
      where: { id: order.id },
      data: {
        status: dto.status,
        ...(dto.status === PickupOrderStatus.CANCELLED && dto.cancelledReason
          ? { cancelledReason: dto.cancelledReason }
          : {}),
      },
      include: {
        branch: true,
        items: { include: { menuItem: true } },
      },
    });

    try {
      this.tablesGateway.server?.to(`branch:${order.branchId}`).emit('pickupOrder:statusChanged', updated);
    } catch {
      // Bỏ qua lỗi socket
    }

    return updated;
  }

  async verifyPickupCode(orderCodeInput: string, user: ICurrentUser) {
    let cleanCode = (orderCodeInput || '').trim();
    try {
      const parsed = JSON.parse(cleanCode);
      if (parsed && typeof parsed === 'object' && parsed.code) {
        cleanCode = String(parsed.code).trim();
      }
    } catch {
      // Chuỗi bình thường, không phải JSON
    }
    cleanCode = cleanCode.replace(/^["']|["']$/g, '').toUpperCase();

    const order = await this.prisma.pickupOrder.findFirst({
      where: {
        OR: [
          { orderCode: cleanCode },
          { id: cleanCode.length === 36 && cleanCode.includes('-') ? cleanCode : undefined },
        ],
      },
      include: {
        branch: true,
        items: { include: { menuItem: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng mang về với mã nhận hàng "${cleanCode}".`);
    }

    if (user.role === Role.STAFF && user.branchId && order.branchId !== user.branchId) {
      throw new ForbiddenException('Đơn hàng này thuộc chi nhánh khác.');
    }

    // Nếu đơn chưa giao và chưa hủy -> tự động chuyển sang COMPLETED
    if (
      order.status === PickupOrderStatus.READY ||
      order.status === PickupOrderStatus.CONFIRMED ||
      order.status === PickupOrderStatus.PREPARING ||
      order.status === PickupOrderStatus.PENDING
    ) {
      return this.updatePickupOrderStatus(
        order.id,
        { status: PickupOrderStatus.COMPLETED },
        user,
      );
    }

    return order;
  }
}
