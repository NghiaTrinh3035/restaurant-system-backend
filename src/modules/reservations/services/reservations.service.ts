import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReservationDto, PreOrderItemDto } from '../dto/create-reservation.dto';
import { QueryAvailableSlotsDto } from '../dto/query-available-slots.dto';
import { QueryReservationDto } from '../dto/query-reservation.dto';
import { QueryMyReservationsDto, ReservationTimeline } from '../dto/query-my-reservations.dto';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import { ReservationStatus, Prisma, Role } from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { TableLockService } from 'src/modules/tables/services/table-lock.service';
import { TablesGateway } from 'src/gateway/tables.gateway';
import {
  generateReservationCode,
  getLocalNow,
  hasReservationStarted,
  isCapacitySuitable,
  timeStringToMinutes,
  toDateOnly,
} from '../helpers/reservation.helper';
import { ReservationAvailabilityService } from './reservation-availability.service';

const EDITABLE_STATUSES: ReservationStatus[] = [ReservationStatus.PENDING, ReservationStatus.CONFIRMED];

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: ReservationAvailabilityService,
    private readonly tableLockService: TableLockService,
    private readonly tablesGateway: TablesGateway,
  ) {}

  async createReservation(dto: CreateReservationDto, user?: ICurrentUser) {
    const branch = await this.availability.getBranchContext(dto.branchId);
    const window = this.availability.validateBookingTime(branch, dto.reservationDate, dto.reservationTime);
    const reqMins = timeStringToMinutes(dto.reservationTime);
    const capacities = branch.tables.map((t) => t.tableType.capacity);

    if (!capacities.some((c) => c >= dto.guestCount)) {
      throw new BadRequestException(
        `Chi nhánh không có bàn đủ chỗ cho ${dto.guestCount} khách. Vui lòng liên hệ hotline ${branch.phone} để đặt tiệc.`,
      );
    }

    // Khách chọn bàn cụ thể trên sơ đồ: bắt buộc đăng nhập và đang giữ bàn đúng khung giờ
    const slot = dto.tableId
      ? { branchId: dto.branchId, tableId: dto.tableId, date: dto.reservationDate, time: dto.reservationTime }
      : null;
    const table = dto.tableId ? branch.tables.find((t) => t.id === dto.tableId) : undefined;

    if (slot) {
      if (!user) {
        throw new UnauthorizedException('Vui lòng đăng nhập để đặt bàn theo vị trí đã chọn.');
      }
      if (!table) {
        throw new BadRequestException('Bàn đã chọn không tồn tại hoặc đang tạm ngưng phục vụ.');
      }
      if (!isCapacitySuitable(table.tableType.capacity, dto.guestCount, capacities)) {
        throw new BadRequestException(`Bàn ${table.tableNumber} không phù hợp cho ${dto.guestCount} khách.`);
      }
      if ((await this.tableLockService.getLockOwner(slot)) !== user.id) {
        throw new BadRequestException(
          'Thời gian giữ bàn đã hết hoặc bàn không còn được giữ cho bạn. Vui lòng quay lại chọn bàn.',
        );
      }
    }

    const preOrderLines = await this.resolvePreOrderLines(dto.branchId, dto.preOrders);
    const reservationCode = generateReservationCode(dto.reservationDate);
    const phone = dto.customerPhone.trim();

    let created;
    try {
      created = await this.prisma.$transaction(
        async (tx) => {
          const reservations = await this.availability.getActiveReservations(dto.branchId, dto.reservationDate, tx);
          const overlapping = this.availability.filterOverlapping(reservations, reqMins, window.slotDuration);

          // Chống đặt trùng: cùng SĐT / tài khoản đã có đơn chồng khung giờ tại chi nhánh
          if (overlapping.some((r) => r.customerPhone === phone || (user && r.userId === user.id))) {
            throw new BadRequestException('Bạn đã có một đơn đặt bàn trùng khung giờ này tại chi nhánh.');
          }

          if (table) {
            if (overlapping.some((r) => r.tableId === table.id)) {
              throw new BadRequestException(`Bàn ${table.tableNumber} đã được đặt trong khung giờ này.`);
            }
          } else if (
            this.availability.countRemainingTables(
              branch.tables,
              reservations,
              dto.guestCount,
              reqMins,
              window.slotDuration,
            ) <= 0
          ) {
            throw new BadRequestException('Khung giờ này đã kín bàn phù hợp. Vui lòng chọn khung giờ khác.');
          }

          const reservation = await tx.reservation.create({
            data: {
              reservationCode,
              branchId: dto.branchId,
              userId: user?.id || null,
              tableId: table?.id ?? null,
              tableTypeId: table?.tableTypeId ?? dto.tableTypeId ?? null,
              customerName: dto.customerName.trim(),
              customerPhone: phone,
              customerEmail: dto.customerEmail,
              guestCount: dto.guestCount,
              reservationDate: toDateOnly(dto.reservationDate),
              reservationTime: dto.reservationTime,
              slotDurationMinutes: window.slotDuration,
              specialNotes: dto.specialNotes,
              status: ReservationStatus.PENDING,
            },
          });

          if (preOrderLines.length > 0) {
            await tx.reservationOrder.createMany({
              data: preOrderLines.map((line) => ({ ...line, reservationId: reservation.id })),
            });
          }

          return tx.reservation.findUnique({
            where: { id: reservation.id },
            include: {
              branch: true,
              tableType: true,
              table: true,
              orders: { include: { menuItem: true } },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new ConflictException('Khung giờ vừa có người đặt, vui lòng thử lại.');
      }
      throw err;
    }

    // Bàn đã chuyển sang trạng thái đã đặt: bỏ khóa tạm và báo realtime cho chi nhánh
    if (slot && user) {
      await this.tableLockService.consumeLock(slot, user.id);
      this.tablesGateway.notifyTableReserved(slot);
    }

    return created;
  }

  getAvailableSlots(query: QueryAvailableSlotsDto) {
    return this.availability.getAvailableSlots(query);
  }

  /**
   * Chuẩn hóa danh sách món gọi trước theo thực đơn & giá riêng của chi nhánh
   */
  private async resolvePreOrderLines(branchId: string, items?: PreOrderItemDto[]) {
    if (!items || items.length === 0) return [];

    const branchMenuItems = await this.prisma.branchMenuItem.findMany({
      where: {
        branchId,
        menuItemId: { in: items.map((i) => i.menuItemId) },
        isActive: true,
        isAvailable: true,
      },
      include: { menuItem: true },
    });

    const priceMap = new Map<string, number>();
    for (const bmi of branchMenuItems) {
      const price = bmi.priceOverride !== null ? Number(bmi.priceOverride) : Number(bmi.menuItem.price);
      priceMap.set(bmi.menuItemId, price);
    }

    return items.map((item) => {
      const unitPrice = priceMap.get(item.menuItemId);
      if (unitPrice === undefined) {
        throw new BadRequestException('Món ăn không tồn tại hoặc tạm ngưng phục vụ tại chi nhánh này.');
      }
      return { menuItemId: item.menuItemId, quantity: item.quantity, unitPrice, note: item.note };
    });
  }

  async getReservations(query: QueryReservationDto, user?: ICurrentUser) {
    const where: Prisma.ReservationWhereInput = {};

    if (user && user.role === Role.USER) {
      where.userId = user.id;
    } else if (user && user.role === Role.STAFF) {
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
        { reservationCode: { contains: term, mode: 'insensitive' } },
        { customerName: { contains: term, mode: 'insensitive' } },
        { customerPhone: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.fromDate || query.toDate) {
      where.reservationDate = {};
      if (query.fromDate) {
        where.reservationDate.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
      }
      if (query.toDate) {
        where.reservationDate.lte = new Date(`${query.toDate}T23:59:59.999Z`);
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ reservationDate: 'desc' }, { reservationTime: 'desc' }],
        include: {
          branch: { select: { id: true, name: true, phone: true, streetAddress: true } },
          tableType: true,
          table: true,
          orders: { include: { menuItem: true } },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return {
      items,
      meta: new PaginationMetaDto(page, limit, totalItems),
    };
  }

  async getMyReservations(query: QueryMyReservationsDto, user: ICurrentUser) {
    const where: Prisma.ReservationWhereInput = {
      userId: user.id,
    };

    const todayStart = toDateOnly(getLocalNow().date);

    let orderBy: Prisma.ReservationOrderByWithRelationInput[] = [
      { reservationDate: 'desc' },
      { reservationTime: 'desc' },
    ];

    if (query.timeline === ReservationTimeline.UPCOMING) {
      where.status = { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] };
      where.reservationDate = { gte: todayStart };
      orderBy = [{ reservationDate: 'asc' }, { reservationTime: 'asc' }];
    } else if (query.timeline === ReservationTimeline.PAST) {
      where.OR = [
        { status: { in: [ReservationStatus.SEATED, ReservationStatus.COMPLETED, ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW] } },
        { reservationDate: { lt: todayStart } },
      ];
      orderBy = [{ reservationDate: 'desc' }, { reservationTime: 'desc' }];
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          branch: { select: { id: true, name: true, phone: true, streetAddress: true } },
          tableType: true,
          table: true,
          orders: { include: { menuItem: true } },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    const enrichedItems = items.map((r) => {
      const qrCheckInPayload = JSON.stringify({
        code: r.reservationCode,
        branchId: r.branchId,
        date: r.reservationDate.toISOString().split('T')[0],
        time: r.reservationTime,
        phone: r.customerPhone,
        name: r.customerName,
      });

      const canCancel =
        EDITABLE_STATUSES.includes(r.status) && !hasReservationStarted(r.reservationDate, r.reservationTime);

      return {
        ...r,
        qrCheckInPayload,
        canCancel,
      };
    });

    return {
      items: enrichedItems,
      meta: new PaginationMetaDto(page, limit, totalItems),
    };
  }

  async getReservationById(id: string, user?: ICurrentUser) {
    const reservation = await this.prisma.reservation.findFirst({
      where: {
        OR: [{ id: id.includes('-') && id.length === 36 ? id : undefined }, { reservationCode: id }],
      },
      include: {
        branch: true,
        tableType: true,
        table: true,
        orders: { include: { menuItem: true } },
      },
    });

    if (!reservation) {
      throw new NotFoundException('Không tìm thấy thông tin đặt bàn.');
    }

    if (user && user.role === Role.USER && reservation.userId && reservation.userId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền truy cập thông tin đặt bàn này.');
    }

    return reservation;
  }

  async cancelReservation(id: string, reason: string | undefined, user: ICurrentUser) {
    const reservation = await this.getReservationById(id, user);
    const isCustomer = user.role === Role.USER;

    if (isCustomer && reservation.userId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền hủy đơn đặt bàn này.');
    }
    if (user.role === Role.STAFF && user.branchId && reservation.branchId !== user.branchId) {
      throw new ForbiddenException('Bạn chỉ được hủy đơn đặt bàn thuộc chi nhánh của mình.');
    }
    if (!EDITABLE_STATUSES.includes(reservation.status)) {
      throw new BadRequestException('Chỉ có thể hủy đơn đang chờ xác nhận hoặc đã xác nhận.');
    }
    if (isCustomer && hasReservationStarted(reservation.reservationDate, reservation.reservationTime)) {
      throw new BadRequestException('Đã đến giờ hẹn, không thể hủy trực tuyến. Vui lòng liên hệ nhà hàng.');
    }

    return this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledReason: reason || (isCustomer ? 'Khách hàng yêu cầu hủy đặt bàn.' : 'Nhà hàng hủy đặt bàn.'),
      },
      include: { branch: true },
    });
  }

  async getPreOrders(reservationId: string, user?: ICurrentUser) {
    const reservation = await this.getReservationById(reservationId, user);
    let totalEstimatedPrice = 0;
    const orders = (reservation.orders || []).map((o) => {
      const price = Number(o.unitPrice);
      totalEstimatedPrice += price * o.quantity;
      return {
        ...o,
        unitPrice: price,
        subtotal: price * o.quantity,
      };
    });

    return {
      reservationId: reservation.id,
      reservationCode: reservation.reservationCode,
      branchId: reservation.branchId,
      branchName: reservation.branch?.name,
      orders,
      totalEstimatedPrice,
    };
  }

  async addOrUpdatePreOrders(
    reservationId: string,
    items: PreOrderItemDto[],
    user?: ICurrentUser,
  ) {
    const reservation = await this.getReservationById(reservationId, user);

    if (
      !EDITABLE_STATUSES.includes(reservation.status) ||
      hasReservationStarted(reservation.reservationDate, reservation.reservationTime)
    ) {
      throw new BadRequestException('Không thể chỉnh sửa món ăn của đơn đặt bàn này.');
    }

    const lines = await this.resolvePreOrderLines(reservation.branchId, items);

    await this.prisma.$transaction(async (tx) => {
      await tx.reservationOrder.deleteMany({ where: { reservationId: reservation.id } });
      if (lines.length > 0) {
        await tx.reservationOrder.createMany({
          data: lines.map((line) => ({ ...line, reservationId: reservation.id })),
        });
      }
    });

    return this.getPreOrders(reservation.id, user);
  }
}
