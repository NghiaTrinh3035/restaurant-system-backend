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
import { QueryReservationDto } from '../dto/query-reservation.dto';
import { QueryMyReservationsDto, ReservationTimeline } from '../dto/query-my-reservations.dto';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import {
  PaymentPurpose,
  PaymentStatus,
  ReservationStatus,
  RestaurantTableStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { TablesService } from 'src/modules/tables/services/tables.service';
import { UpdateReservationStatusDto } from '../dto/update-reservation-status.dto';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { TableLockService } from 'src/modules/tables/services/table-lock.service';
import { TablesGateway } from 'src/gateway/tables.gateway';
import { PaymentsService } from 'src/modules/payments/services/payments.service';
import {
  MAX_RESERVATION_TABLES,
  generateReservationCode,
  getLocalNow,
  getReservationTableIds,
  hasReservationStarted,
  timeStringToMinutes,
  toDateOnly,
} from '../helpers/reservation.helper';
import { ReservationAvailabilityService } from './reservation-availability.service';

import { MailService } from 'src/mail/mail.service';
import { DineInService } from 'src/modules/dine-in/services/dine-in.service';
import { Logger } from '@nestjs/common';
import {
  RESERVATION_LIST_INCLUDE,
  buildReservationConfirmedMailPayload,
} from '../helpers/reservation-bill.helper';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EDITABLE_STATUSES: ReservationStatus[] = [ReservationStatus.PENDING, ReservationStatus.CONFIRMED];
const ORDER_ALLOWED_STATUSES: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

type CreatedReservationPayload = Prisma.ReservationGetPayload<{
  include: {
    branch: true;
    tableType: true;
    table: true;
    reservationTables: { include: { table: { include: { tableType: true } } } };
    orders: { include: { menuItem: true } };
  };
}>;

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: ReservationAvailabilityService,
    private readonly tableLockService: TableLockService,
    private readonly tablesGateway: TablesGateway,
    private readonly tablesService: TablesService,
    private readonly mailService: MailService,
    private readonly dineInService: DineInService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async createReservation(
    dto: CreateReservationDto,
    user?: ICurrentUser,
    rawClientIp?: string,
  ) {
    const branch = await this.availability.getBranchContext(dto.branchId);
    const window = this.availability.validateBookingTime(
      branch,
      dto.reservationDate,
      dto.reservationTime,
      dto.durationMinutes,
    );
    const reqMins = timeStringToMinutes(dto.reservationTime);
    const maxCombinableCapacity = branch.tables
      .map((t) => t.tableType.capacity)
      .sort((a, b) => b - a)
      .slice(0, MAX_RESERVATION_TABLES)
      .reduce((sum, cap) => sum + cap, 0);

    if (maxCombinableCapacity < dto.guestCount) {
      throw new BadRequestException(
        `Chi nhánh không đủ bàn phù hợp cho ${dto.guestCount} khách (ghép tối đa ${MAX_RESERVATION_TABLES} bàn). Vui lòng liên hệ hotline ${branch.phone} để đặt tiệc.`,
      );
    }

    const rawTableIds: string[] = [];
    if (dto.tableIds && dto.tableIds.length > 0) {
      rawTableIds.push(...dto.tableIds);
    } else if (dto.tableId) {
      rawTableIds.push(dto.tableId);
    }
    const requestedTableIds = Array.from(new Set(rawTableIds));
    if (requestedTableIds.length > MAX_RESERVATION_TABLES) {
      throw new BadRequestException(
        `Chỉ được chọn tối đa ${MAX_RESERVATION_TABLES} bàn cho một đơn đặt bàn.`,
      );
    }

    const selectedTables = requestedTableIds.map((tableId) => {
      const found = branch.tables.find((t) => t.id === tableId);
      if (!found) {
        throw new BadRequestException('Bàn đã chọn không tồn tại hoặc đang tạm ngưng phục vụ.');
      }
      return found;
    });

    if (selectedTables.length > 0) {
      if (!user) {
        throw new UnauthorizedException('Vui lòng đăng nhập để đặt bàn theo vị trí đã chọn.');
      }
      const totalSelectedSeats = selectedTables.reduce((sum, t) => sum + t.tableType.capacity, 0);
      if (totalSelectedSeats < dto.guestCount) {
        throw new BadRequestException(
          `Tổng sức chứa các bàn đã chọn (${totalSelectedSeats} chỗ) chưa đủ cho ${dto.guestCount} khách.`,
        );
      }
      for (const table of selectedTables) {
        const slot = {
          branchId: dto.branchId,
          tableId: table.id,
          date: dto.reservationDate,
          time: dto.reservationTime,
        };
        if ((await this.tableLockService.getLockOwner(slot)) !== user.id) {
          throw new BadRequestException(
            `Thời gian giữ bàn ${table.tableNumber} đã hết hoặc bàn không còn được giữ cho bạn. Vui lòng quay lại chọn bàn.`,
          );
        }
      }
    }

    const preOrderLines = await this.resolvePreOrderLines(dto.branchId, dto.preOrders);
    const requiresOnlineDeposit = Boolean(dto.paymentProvider && preOrderLines.length > 0);
    const initialStatus = requiresOnlineDeposit
      ? ReservationStatus.AWAITING_PAYMENT
      : ReservationStatus.PENDING;
    const reservationCode = generateReservationCode(dto.reservationDate);
    const phone = dto.customerPhone.trim();

    let createdId: string;
    try {
      createdId = await this.prisma.$transaction(
        async (tx) => {
          // Hủy các phiên thanh toán dở trước đó của cùng người dùng để tránh kẹt giao dịch cũ
          if (user) {
            const staleAwaiting = await tx.reservation.findMany({
              where: {
                branchId: dto.branchId,
                userId: user.id,
                status: ReservationStatus.AWAITING_PAYMENT,
              },
              select: { id: true },
            });
            if (staleAwaiting.length > 0) {
              const staleIds = staleAwaiting.map((s) => s.id);
              await tx.reservation.updateMany({
                where: { id: { in: staleIds } },
                data: {
                  status: ReservationStatus.CANCELLED,
                  cancelledReason: 'Khách hàng tạo phiên đặt bàn mới.',
                },
              });
              await tx.paymentTransaction.updateMany({
                where: { reservationId: { in: staleIds }, status: PaymentStatus.PENDING },
                data: { status: PaymentStatus.EXPIRED },
              });
            }
          }

          const reservations = await this.availability.getActiveReservations(dto.branchId, dto.reservationDate, tx);
          const overlapping = this.availability.filterOverlapping(reservations, reqMins, window.slotDuration);

          if (overlapping.some((r) => r.customerPhone === phone || (user && r.userId === user.id))) {
            throw new BadRequestException('Bạn đã có một đơn đặt bàn trùng khung giờ này tại chi nhánh.');
          }

          if (selectedTables.length > 0) {
            for (const table of selectedTables) {
              if (overlapping.some((r) => getReservationTableIds(r).includes(table.id))) {
                throw new BadRequestException(`Bàn ${table.tableNumber} đã được đặt trong khung giờ này.`);
              }
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

          const primaryTable = selectedTables[0];
          const reservation = await tx.reservation.create({
            data: {
              reservationCode,
              branchId: dto.branchId,
              userId: user?.id || null,
              tableId: primaryTable ? primaryTable.id : null,
              tableTypeId: primaryTable ? primaryTable.tableTypeId : (dto.tableTypeId ?? null),
              customerName: dto.customerName.trim(),
              customerPhone: phone,
              customerEmail: dto.customerEmail,
              guestCount: dto.guestCount,
              reservationDate: toDateOnly(dto.reservationDate),
              reservationTime: dto.reservationTime,
              slotDurationMinutes: window.slotDuration,
              specialNotes: dto.specialNotes,
              status: initialStatus,
              ...(selectedTables.length > 0
                ? { reservationTables: { create: selectedTables.map((t) => ({ tableId: t.id })) } }
                : {}),
              ...(preOrderLines.length > 0 ? { orders: { create: preOrderLines } } : {}),
            },
            select: { id: true },
          });

          return reservation.id;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 15000,
        },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new ConflictException('Khung giờ vừa có người đặt, vui lòng thử lại.');
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2028') {
        throw new ConflictException('Hệ thống đang xử lý nhiều yêu cầu đặt bàn, vui lòng thử lại sau giây lát.');
      }
      throw err;
    }

    const created: CreatedReservationPayload | null = await this.prisma.reservation.findUnique({
      where: { id: createdId },
      include: {
        branch: true,
        tableType: true,
        table: true,
        reservationTables: {
          include: { table: { include: { tableType: true } } },
          orderBy: { createdAt: 'asc' },
        },
        orders: { include: { menuItem: true } },
      },
    });

    if (!created) {
      throw new BadRequestException('Không thể hoàn tất tạo đơn đặt bàn.');
    }

    // Đặt cọc online: giữ bàn ở trạng thái khóa tạm 15 phút cho tới khi cổng thanh toán xác nhận
    if (requiresOnlineDeposit && dto.paymentProvider) {
      let paymentRes: Awaited<ReturnType<PaymentsService['createPayment']>>;
      try {
        paymentRes = await this.paymentsService.createPayment(
          {
            provider: dto.paymentProvider,
            purpose: PaymentPurpose.RESERVATION_DEPOSIT,
            reservationId: created.id,
          },
          user,
          rawClientIp,
        );
      } catch (err) {
        await this.prisma.reservation.updateMany({
          where: { id: created.id, status: ReservationStatus.AWAITING_PAYMENT },
          data: {
            status: ReservationStatus.CANCELLED,
            cancelledReason: 'Không thể khởi tạo giao dịch thanh toán cọc.',
          },
        });
        throw err;
      }

      if (requestedTableIds.length > 0 && user) {
        await this.tableLockService.extendSlotLocks(
          dto.branchId,
          requestedTableIds,
          dto.reservationDate,
          dto.reservationTime,
          user.id,
          900,
        );
      }

      return {
        ...created,
        payment: paymentRes,
        payUrl: paymentRes.payUrl,
      };
    }

    if (requestedTableIds.length > 0 && user) {
      await this.tableLockService.consumeSlotLocks(
        dto.branchId,
        requestedTableIds,
        dto.reservationDate,
        dto.reservationTime,
        user.id,
      );
      this.tablesGateway.notifyTablesReserved({
        branchId: dto.branchId,
        tableIds: requestedTableIds,
        date: dto.reservationDate,
        time: dto.reservationTime,
      });
    }

    try {
      this.tablesGateway.notifyReservationCreated(dto.branchId, created);
    } catch {
      // Bỏ qua lỗi socket nếu có
    }

    return created;
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
    } else {
      where.status = { not: ReservationStatus.AWAITING_PAYMENT };
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
        include: RESERVATION_LIST_INCLUDE,
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
      where.OR = [
        {
          status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
          reservationDate: { gte: todayStart },
        },
        { status: ReservationStatus.SEATED },
      ];
      orderBy = [{ reservationDate: 'asc' }, { reservationTime: 'asc' }];
    } else if (query.timeline === ReservationTimeline.PAST) {
      where.OR = [
        { status: { in: [ReservationStatus.COMPLETED, ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW] } },
        {
          reservationDate: { lt: todayStart },
          status: { notIn: [ReservationStatus.SEATED, ReservationStatus.AWAITING_PAYMENT] },
        },
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
        include: RESERVATION_LIST_INCLUDE,
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
    const orConditions: Prisma.ReservationWhereInput[] = [{ reservationCode: id }];
    if (UUID_REGEX.test(id)) {
      orConditions.unshift({ id });
    }

    const reservation = await this.prisma.reservation.findFirst({
      where: {
        OR: orConditions,
      },
      include: {
        ...RESERVATION_LIST_INCLUDE,
        branch: true,
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

    const refundReason =
      reason || (isCustomer ? 'Khách hàng yêu cầu hủy đặt bàn.' : 'Nhà hàng hủy đặt bàn.');

    const updated = await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledReason: refundReason,
      },
      include: RESERVATION_LIST_INCLUDE,
    });

    try {
      await this.paymentsService.markRefunded({ reservationId: reservation.id }, refundReason);
    } catch (err) {
      this.logger.error(`[Refund] Hoàn tiền đặt bàn thất bại cho ${reservation.reservationCode}:`, err);
    }

    try {
      this.tablesGateway.notifyReservationUpdated(reservation.branchId, updated);
    } catch {
      // Bỏ qua lỗi socket nếu có
    }

    return updated;
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

    if (user && user.role === Role.STAFF && user.branchId && reservation.branchId !== user.branchId) {
      throw new ForbiddenException('Bạn chỉ có quyền cập nhật món ăn của đơn đặt bàn thuộc chi nhánh của mình.');
    }

    if (reservation.status === ReservationStatus.SEATED) {
      throw new BadRequestException(
        'Khách đã nhận bàn, vui lòng gọi thêm món theo đợt tại bàn để chuyển thẳng xuống nhà bếp.',
      );
    }

    if (!ORDER_ALLOWED_STATUSES.includes(reservation.status)) {
      throw new BadRequestException('Đơn đặt bàn đã kết thúc hoặc đã bị hủy, không thể gọi thêm món.');
    }

    if (
      (reservation.status === ReservationStatus.PENDING || reservation.status === ReservationStatus.CONFIRMED) &&
      hasReservationStarted(reservation.reservationDate, reservation.reservationTime)
    ) {
      throw new BadRequestException('Đã qua giờ hẹn đặt bàn, vui lòng liên hệ nhà hàng để hỗ trợ.');
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

    const updatedPreOrders = await this.getPreOrders(reservation.id, user);

    try {
      const fullUpdated = await this.prisma.reservation.findUnique({
        where: { id: reservation.id },
        include: {
          branch: true,
          table: true,
          orders: { include: { menuItem: true } },
        },
      });
      if (fullUpdated) {
        this.tablesGateway.notifyReservationUpdated(reservation.branchId, fullUpdated);
      }
    } catch {
      // Bỏ qua lỗi socket nếu có
    }

    return updatedPreOrders;
  }

  async updateReservationStatus(
    id: string,
    dto: UpdateReservationStatusDto,
    user: ICurrentUser,
  ) {
    const reservation = await this.getReservationById(id, user);

    if (user.role === Role.STAFF && user.branchId && reservation.branchId !== user.branchId) {
      throw new ForbiddenException('Bạn chỉ có quyền cập nhật đơn đặt bàn thuộc chi nhánh của mình.');
    }

    const requestedAssignIds =
      dto.tableIds && dto.tableIds.length > 0
        ? Array.from(new Set(dto.tableIds))
        : dto.tableId
          ? [dto.tableId]
          : null;

    if (requestedAssignIds) {
      if (requestedAssignIds.length > MAX_RESERVATION_TABLES) {
        throw new BadRequestException(
          `Chỉ được gán tối đa ${MAX_RESERVATION_TABLES} bàn cho một đơn đặt bàn.`,
        );
      }
      const validTables = await this.prisma.restaurantTable.findMany({
        where: { id: { in: requestedAssignIds }, branchId: reservation.branchId, isActive: true },
        select: { id: true },
      });
      if (validTables.length !== requestedAssignIds.length) {
        throw new BadRequestException('Một hoặc nhiều bàn được chọn không tồn tại hoặc không thuộc chi nhánh này.');
      }
    }

    const targetTableIds = requestedAssignIds ?? getReservationTableIds(reservation);
    const primaryTableId = targetTableIds[0] ?? null;

    const updated = await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: dto.status,
        ...(requestedAssignIds
          ? {
              tableId: primaryTableId,
              reservationTables: {
                deleteMany: {},
                create: requestedAssignIds.map((tableId) => ({ tableId })),
              },
            }
          : {}),
        ...(dto.status === ReservationStatus.CANCELLED && dto.note
          ? { cancelledReason: dto.note }
          : {}),
      },
      include: {
        branch: true,
        table: true,
        reservationTables: {
          include: { table: { include: { tableType: true } } },
          orderBy: { createdAt: 'asc' },
        },
        orders: { include: { menuItem: true } },
        user: { select: { email: true, fullName: true } },
      },
    });

    if (dto.status === ReservationStatus.CANCELLED) {
      try {
        await this.paymentsService.markRefunded(
          { reservationId: reservation.id },
          dto.note || 'Nhà hàng hủy đặt bàn',
        );
      } catch (err) {
        this.logger.error(`[Refund] Hoàn tiền đặt bàn thất bại cho ${reservation.reservationCode}:`, err);
      }
    }

    if (dto.status === ReservationStatus.CONFIRMED) {
      const recipientEmail = updated.customerEmail || updated.user?.email;
      if (recipientEmail) {
        this.mailService
          .sendReservationConfirmedEmail(
            recipientEmail,
            buildReservationConfirmedMailPayload(updated),
          )
          .catch((err) => {
            this.logger.error(`[Mail] Gửi email xác nhận đặt bàn thất bại cho ${recipientEmail}:`, err);
          });
      }
    }

    if (dto.status === ReservationStatus.SEATED && targetTableIds.length > 0) {
      for (const tableId of targetTableIds) {
        try {
          await this.tablesService.updateTableStatus(
            tableId,
            { status: RestaurantTableStatus.OCCUPIED, note: `Khách ${reservation.customerName} đang dùng bữa` },
            user,
          );
        } catch {
          // Tiếp tục dù lỗi socket
        }
      }
      if (primaryTableId) {
        try {
          await this.dineInService.ensureInvoiceForSeatedReservation(primaryTableId, updated.id);
        } catch (err) {
          this.logger.error(`[DineIn] Không thể mở hóa đơn khi nhận bàn cho ${updated.reservationCode}:`, err);
        }
      }
    }

    if (dto.status === ReservationStatus.COMPLETED) {
      try {
        await this.dineInService.closeOrFinalizeReservationInvoices(updated.id, 'COMPLETED');
      } catch (err) {
        this.logger.error(`[DineIn] Không thể chốt hóa đơn cho đơn ${updated.reservationCode}:`, err);
      }
      for (const tableId of targetTableIds) {
        try {
          await this.tablesService.updateTableStatus(
            tableId,
            { status: RestaurantTableStatus.DIRTY, note: `Khách vừa dùng bữa xong (${reservation.reservationCode})` },
            user,
          );
        } catch {
          // Tiếp tục dù lỗi socket
        }
      }
    }

    if (dto.status === ReservationStatus.CANCELLED || dto.status === ReservationStatus.NO_SHOW) {
      try {
        await this.dineInService.closeOrFinalizeReservationInvoices(updated.id, 'CANCELLED');
      } catch (err) {
        this.logger.error(`[DineIn] Không thể hủy hóa đơn cho đơn ${updated.reservationCode}:`, err);
      }
      for (const tableId of targetTableIds) {
        try {
          const currentTable = await this.prisma.restaurantTable.findUnique({ where: { id: tableId } });
          if (currentTable && currentTable.status === RestaurantTableStatus.OCCUPIED) {
            await this.tablesService.updateTableStatus(
              tableId,
              { status: RestaurantTableStatus.AVAILABLE, note: `Giải phóng bàn sau khi hủy đơn ${reservation.reservationCode}` },
              user,
            );
          }
        } catch {
          // Tiếp tục dù lỗi socket
        }
      }
    }

    try {
      this.tablesGateway.notifyReservationUpdated(reservation.branchId, updated);
    } catch {
      // Bỏ qua lỗi socket nếu có
    }

    return updated;
  }

  async checkInQr(reservationCode: string, user: ICurrentUser) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { reservationCode },
    });
    if (!reservation) {
      throw new NotFoundException('Không tìm thấy thông tin đặt bàn với mã này.');
    }
    return this.updateReservationStatus(
      reservation.id,
      { status: ReservationStatus.SEATED, note: 'Khách đã quét mã QR check-in tại quầy' },
      user,
    );
  }
}
