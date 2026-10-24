import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReservationDto, PreOrderItemDto } from '../dto/create-reservation.dto';
import { QueryAvailableSlotsDto } from '../dto/query-available-slots.dto';
import { QueryReservationDto } from '../dto/query-reservation.dto';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import {
  ReservationStatus,
  RestaurantBranchStatus,
  Prisma,
  Role,
} from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import {
  generateReservationCode,
  generateDailyTimeSlots,
  timeStringToMinutes,
} from '../helpers/reservation.helper';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReservation(dto: CreateReservationDto, user?: ICurrentUser) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
      include: {
        operatingHours: true,
        tables: { where: { isActive: true } },
      },
    });

    if (!branch || branch.status !== RestaurantBranchStatus.ACTIVE) {
      throw new NotFoundException('Chi nhánh không tồn tại hoặc đã ngừng hoạt động.');
    }

    const bookingDate = new Date(`${dto.reservationDate}T00:00:00.000Z`);
    const todayStr = new Date().toISOString().split('T')[0];
    if (dto.reservationDate < todayStr) {
      throw new BadRequestException('Không thể đặt bàn vào ngày trong quá khứ.');
    }

    const dayOfWeek = bookingDate.getUTCDay();
    const schedule = branch.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);

    const openTime = schedule?.openTime || branch.openingTime || '08:00';
    const closeTime = schedule?.closeTime || branch.closingTime || '22:00';
    const isOpen = schedule ? schedule.isOpen : true;

    if (!isOpen) {
      throw new BadRequestException('Chi nhánh không mở cửa phục vụ vào ngày đã chọn.');
    }

    const slotDuration = branch.slotDurationMinutes || 90;
    const reqMins = timeStringToMinutes(dto.reservationTime);
    const openMins = timeStringToMinutes(openTime);
    const closeMins = timeStringToMinutes(closeTime);

    if (reqMins < openMins || reqMins + slotDuration > closeMins) {
      throw new BadRequestException(
        `Giờ đặt bàn (${dto.reservationTime}) nằm ngoài khung giờ phục vụ (${openTime} - ${closeTime}).`,
      );
    }

    const activeReservations = await this.prisma.reservation.findMany({
      where: {
        branchId: dto.branchId,
        reservationDate: bookingDate,
        status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED] },
      },
    });

    let overlappingCount = 0;
    for (const r of activeReservations) {
      const resMins = timeStringToMinutes(r.reservationTime);
      if (Math.abs(resMins - reqMins) < slotDuration) {
        overlappingCount++;
      }
    }

    const totalAvailableTables = branch.tables.length || 10;
    if (overlappingCount >= totalAvailableTables) {
      throw new BadRequestException('Khung giờ này đã kín bàn tại chi nhánh. Vui lòng chọn khung giờ khác.');
    }

    const reservationCode = generateReservationCode(dto.reservationDate);

    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.create({
        data: {
          reservationCode,
          branchId: dto.branchId,
          userId: user?.id || null,
          tableTypeId: dto.tableTypeId || null,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,
          guestCount: dto.guestCount,
          reservationDate: bookingDate,
          reservationTime: dto.reservationTime,
          slotDurationMinutes: slotDuration,
          specialNotes: dto.specialNotes,
          status: ReservationStatus.PENDING,
        },
        include: {
          branch: true,
          tableType: true,
        },
      });

      if (dto.preOrders && dto.preOrders.length > 0) {
        for (const item of dto.preOrders) {
          const menuItem = await tx.menuItem.findUnique({
            where: { id: item.menuItemId },
          });
          if (menuItem) {
            await tx.reservationOrder.create({
              data: {
                reservationId: reservation.id,
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPrice: menuItem.price,
                note: item.note,
              },
            });
          }
        }
      }

      return tx.reservation.findUnique({
        where: { id: reservation.id },
        include: {
          branch: true,
          tableType: true,
          orders: { include: { menuItem: true } },
        },
      });
    });
  }

  async getAvailableSlots(query: QueryAvailableSlotsDto) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: query.branchId },
      include: {
        operatingHours: true,
        tables: { where: { isActive: true } },
      },
    });

    if (!branch) {
      throw new NotFoundException('Không tìm thấy chi nhánh.');
    }

    const dateObj = new Date(`${query.date}T00:00:00.000Z`);
    const dayOfWeek = dateObj.getUTCDay();
    const schedule = branch.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);

    const isOpen = schedule ? schedule.isOpen : true;
    if (!isOpen) {
      return { branchId: branch.id, date: query.date, slots: [] };
    }

    const openTime = schedule?.openTime || branch.openingTime || '08:00';
    const closeTime = schedule?.closeTime || branch.closingTime || '22:00';
    const slotDuration = branch.slotDurationMinutes || 90;

    const timeSlots = generateDailyTimeSlots(openTime, closeTime, slotDuration, 30);

    const activeReservations = await this.prisma.reservation.findMany({
      where: {
        branchId: query.branchId,
        reservationDate: dateObj,
        status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED] },
      },
    });

    const totalTables = branch.tables.length || 10;

    const slots = timeSlots.map((time) => {
      const slotMins = timeStringToMinutes(time);
      let busyCount = 0;
      for (const r of activeReservations) {
        const resMins = timeStringToMinutes(r.reservationTime);
        if (Math.abs(resMins - slotMins) < slotDuration) {
          busyCount++;
        }
      }
      const remaining = Math.max(0, totalTables - busyCount);
      return {
        time,
        isAvailable: remaining > 0,
        remainingTables: remaining,
      };
    });

    return {
      branchId: branch.id,
      branchName: branch.name,
      date: query.date,
      slotDurationMinutes: slotDuration,
      slots,
    };
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

  async cancelReservation(id: string, reason?: string, user?: ICurrentUser) {
    const reservation = await this.getReservationById(id, user);

    if (
      reservation.status === ReservationStatus.COMPLETED ||
      reservation.status === ReservationStatus.CANCELLED
    ) {
      throw new BadRequestException('Không thể hủy đơn đặt bàn đã hoàn tất hoặc đã hủy trước đó.');
    }

    return this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledReason: reason || 'Khách hàng yêu cầu hủy đặt bàn.',
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
      reservation.status === ReservationStatus.COMPLETED ||
      reservation.status === ReservationStatus.CANCELLED ||
      reservation.status === ReservationStatus.NO_SHOW
    ) {
      throw new BadRequestException('Không thể chỉnh sửa món ăn của đơn đặt bàn này.');
    }

    const branchMenuItems = await this.prisma.branchMenuItem.findMany({
      where: {
        branchId: reservation.branchId,
        isActive: true,
        isAvailable: true,
      },
      include: { menuItem: true },
    });

    const menuMap = new Map<string, { price: number; name: string }>();
    for (const bmi of branchMenuItems) {
      const finalPrice = bmi.priceOverride !== null ? Number(bmi.priceOverride) : Number(bmi.menuItem.price);
      menuMap.set(bmi.menuItemId, { price: finalPrice, name: bmi.menuItem.name });
    }

    for (const item of items) {
      if (!menuMap.has(item.menuItemId)) {
        throw new BadRequestException('Món ăn không tồn tại hoặc tạm ngưng phục vụ tại chi nhánh này.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.reservationOrder.deleteMany({
        where: { reservationId: reservation.id },
      });

      if (items.length > 0) {
        for (const item of items) {
          const info = menuMap.get(item.menuItemId)!;
          await tx.reservationOrder.create({
            data: {
              reservationId: reservation.id,
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              unitPrice: info.price,
              note: item.note,
            },
          });
        }
      }

      return this.getPreOrders(reservation.id, user);
    });
  }
}
