import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import Redis from 'ioredis';
import { TablesGateway } from 'src/gateway/tables.gateway';
import { NotificationsService } from 'src/modules/notifications/services/notifications.service';
import { TableLockService } from './table-lock.service';
import {
  getLocalNow,
  getReservationTableIds,
  timeStringToMinutes,
  toDateOnly,
} from 'src/modules/reservations/helpers/reservation.helper';
import { CreateRestaurantTableDto } from '../dto/restaurant-table.dto';
import { CreateTableTypeDto } from '../dto/table-type.dto';
import { UpdateRestaurantTableDto } from '../dto/update-restaurant-table.dto';
import { UpdateTableTypeDto } from '../dto/update-table-type.dto';
import { BulkCreateRestaurantTableDto } from '../dto/bulk-create-restaurant-table.dto';
import { QueryTableTypeDto } from '../dto/query-table-type.dto';
import { QueryRestaurantTableDto } from '../dto/query-restaurant-table.dto';
import { UpdateTableStatusDto } from '../dto/update-table-status.dto';
import { BulkCleanTablesDto } from '../dto/bulk-clean-tables.dto';
import { PaymentPurpose, PaymentStatus, Prisma, ReservationStatus, RestaurantTableStatus, Role } from '@prisma/client';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';

@Injectable()
export class TablesService implements OnModuleInit, OnModuleDestroy {
  private static readonly AUTO_EXPIRE_INTERVAL_MS = 60 * 1000;
  // Giữ khóa gần trọn chu kỳ 60s để các instance lệch nhịp không quét DB lặp lại
  private static readonly AUTO_EXPIRE_LOCK_TTL_MS = 55 * 1000;
  private static readonly AUTO_EXPIRE_LOCK_KEY = 'tables:auto-expire:interval-lock';

  private readonly logger = new Logger(TablesService.name);
  private autoExpireInterval?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    @Inject(forwardRef(() => TablesGateway))
    private readonly tablesGateway: TablesGateway,
    @Inject(forwardRef(() => TableLockService))
    private readonly tableLockService: TableLockService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    this.autoExpireInterval = setInterval(() => {
      void this.runScheduledAutoExpire();
    }, TablesService.AUTO_EXPIRE_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.autoExpireInterval) {
      clearInterval(this.autoExpireInterval);
    }
  }

  async runScheduledAutoExpire(): Promise<void> {
    try {
      const acquired = await this.redisClient.set(
        TablesService.AUTO_EXPIRE_LOCK_KEY,
        process.pid.toString(),
        'PX',
        TablesService.AUTO_EXPIRE_LOCK_TTL_MS,
        'NX',
      );
      if (!acquired) return;
      await this.checkAndAutoExpireSeatedTables();
      await this.expireUnpaidReservations();
      await this.checkDirtyTableOverdues();
    } catch (err) {
      this.logger.warn(
        `Auto-expire seated tables failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async createTableType(dto: CreateTableTypeDto) {
    return this.prisma.tableType.create({ data: dto });
  }

  async getTableTypes(query?: QueryTableTypeDto) {
    const where: Prisma.TableTypeWhereInput = {};

    if (query?.capacity) {
      where.capacity = query.capacity;
    }

    if (query?.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (!query || (!query.page && !query.limit && !query.search && !query.capacity)) {
      return this.prisma.tableType.findMany({
        where,
        orderBy: { capacity: 'asc' },
      });
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      this.prisma.tableType.findMany({
        where,
        skip,
        take: limit,
        orderBy: { capacity: 'asc' },
      }),
      this.prisma.tableType.count({ where }),
    ]);

    return {
      items,
      meta: new PaginationMetaDto(page, limit, totalItems),
    };
  }

  async getTableTypeById(id: string) {
    const tableType = await this.prisma.tableType.findUnique({
      where: { id },
    });

    if (!tableType) {
      throw new NotFoundException('Table type not found');
    }

    return tableType;
  }

  async updateTableType(id: string, dto: UpdateTableTypeDto) {
    await this.getTableTypeById(id);

    return this.prisma.tableType.update({
      where: { id },
      data: dto,
    });
  }

  async deleteTableType(id: string) {
    await this.getTableTypeById(id);

    return this.prisma.tableType.delete({
      where: { id },
    });
  }

  async createRestaurantTable(dto: CreateRestaurantTableDto) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const tableType = await this.prisma.tableType.findUnique({
      where: { id: dto.tableTypeId },
    });
    if (!tableType) {
      throw new NotFoundException('Table type not found');
    }

    const existingTable = await this.prisma.restaurantTable.findFirst({
      where: {
        branchId: dto.branchId,
        tableNumber: dto.tableNumber,
      },
    });
    if (existingTable) {
      throw new ConflictException(
        `Table number ${dto.tableNumber} already exists in this branch`,
      );
    }

    return this.prisma.restaurantTable.create({
      data: dto,
    });
  }

  async bulkCreateRestaurantTables(dto: BulkCreateRestaurantTableDto) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const tableType = await this.prisma.tableType.findUnique({
      where: { id: dto.tableTypeId },
    });
    if (!tableType) {
      throw new NotFoundException('Table type not found');
    }

    const start = dto.startNumber || 1;
    const count = dto.quantity;
    const prefix = dto.prefix || `F${dto.floor}-`;

    const tableNumbers: string[] = [];
    for (let i = 0; i < count; i++) {
      const num = (start + i).toString().padStart(2, '0');
      tableNumbers.push(`${prefix}${num}`);
    }

    const existing = await this.prisma.restaurantTable.findMany({
      where: {
        branchId: dto.branchId,
        tableNumber: { in: tableNumbers },
      },
      select: { tableNumber: true },
    });

    if (existing.length > 0) {
      const duplicates = existing.map((t) => t.tableNumber).join(', ');
      throw new ConflictException(
        `Các bàn sau đã tồn tại trong chi nhánh: ${duplicates}`,
      );
    }

    const tablesToCreate = tableNumbers.map((tableNumber) => ({
      tableNumber,
      floor: dto.floor,
status: dto.status,
      note: dto.note && dto.note.trim() ? dto.note.trim() : null,
      branchId: dto.branchId,
      tableTypeId: dto.tableTypeId,
    }));

    return this.prisma.restaurantTable.createMany({
      data: tablesToCreate,
    });
  }

  async getRestaurantTables(query?: QueryRestaurantTableDto) {
    const where: Prisma.RestaurantTableWhereInput = {
      isActive: true,
    };

    if (query?.branchId) {
      where.branchId = query.branchId;
    }

    if (query?.tableTypeId) {
      where.tableTypeId = query.tableTypeId;
    }

    if (query?.floor) {
      where.floor = query.floor;
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { tableNumber: { contains: term, mode: 'insensitive' } },
        { note: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (
      !query ||
      (!query.page &&
        !query.limit &&
        !query.search &&
        !query.branchId &&
        !query.tableTypeId &&
        !query.floor &&
        !query.status)
    ) {
      const rawTables = await this.prisma.restaurantTable.findMany({
        where,
        orderBy: [{ floor: 'asc' }, { tableNumber: 'asc' }],
        include: {
          tableType: true,
          branch: { select: { id: true, name: true } },
        },
      });
      return this.enrichTablesWithRealtimeData(rawTables, query?.branchId);
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      this.prisma.restaurantTable.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ floor: 'asc' }, { tableNumber: 'asc' }],
        include: {
          tableType: true,
          branch: { select: { id: true, name: true } },
        },
      }),
      this.prisma.restaurantTable.count({ where }),
    ]);

    const enrichedItems = await this.enrichTablesWithRealtimeData(items, query?.branchId);

    return {
      items: enrichedItems,
      meta: new PaginationMetaDto(page, limit, totalItems),
    };
  }

  async getRestaurantTablesByBranch(branchId: string) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: {
        branchId,
        isActive: true,
      },
      orderBy: [{ floor: 'asc' }, { tableNumber: 'asc' }],
      include: {
        tableType: true,
      },
    });
    return this.enrichTablesWithRealtimeData(tables, branchId);
  }

  async getRestaurantTableById(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id },
      include: {
        tableType: true,
        branch: { select: { id: true, name: true } },
      },
    });

    if (!table) {
      throw new NotFoundException('Restaurant table not found');
    }

    return table;
  }

  async updateRestaurantTable(id: string, dto: UpdateRestaurantTableDto) {
    const table = await this.getRestaurantTableById(id);

    if (dto.branchId && dto.branchId !== table.branchId) {
      const branch = await this.prisma.restaurantBranch.findUnique({
        where: { id: dto.branchId },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    if (dto.tableTypeId && dto.tableTypeId !== table.tableTypeId) {
      const tableType = await this.prisma.tableType.findUnique({
        where: { id: dto.tableTypeId },
      });
      if (!tableType) {
        throw new NotFoundException('Table type not found');
      }
    }

    const targetBranchId = dto.branchId !== undefined ? dto.branchId : table.branchId;
    const targetTableNumber =
      dto.tableNumber !== undefined ? dto.tableNumber : table.tableNumber;

    if (targetBranchId !== table.branchId || targetTableNumber !== table.tableNumber) {
      const existingTable = await this.prisma.restaurantTable.findFirst({
        where: {
          branchId: targetBranchId,
          tableNumber: targetTableNumber,
          id: { not: id },
        },
      });
      if (existingTable) {
        throw new ConflictException(
          `Table number ${targetTableNumber} already exists in this branch`,
        );
      }
    }

    return this.prisma.restaurantTable.update({
      where: { id },
      data: dto,
    });
  }

  async deleteRestaurantTable(id: string) {
    await this.getRestaurantTableById(id);

    return this.prisma.restaurantTable.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async updateTableStatus(id: string, dto: UpdateTableStatusDto, user?: ICurrentUser) {
    const table = await this.getRestaurantTableById(id);

    if (user && user.role === Role.STAFF) {
      if (user.branchId && user.branchId !== table.branchId) {
        throw new ForbiddenException('Bạn không có quyền quản lý bàn của chi nhánh này.');
      }
    }

    const dataToUpdate: Prisma.RestaurantTableUpdateInput = {
      status: dto.status,
    };
    if (dto.note !== undefined) {
      dataToUpdate.note = dto.note;
    }

    const updated = await this.prisma.restaurantTable.update({
      where: { id },
      data: dataToUpdate,
      include: {
        tableType: true,
        branch: { select: { id: true, name: true } },
      },
    });

    let dirtySince: number | null = null;
    if (dto.status === RestaurantTableStatus.DIRTY) {
      dirtySince = Date.now();
      await this.redisClient.hset(`table:dirty-times:${table.branchId}`, table.id, dirtySince.toString());
      await this.redisClient.srem(`table:dirty-alerted:${table.branchId}`, table.id);
    } else {
      await this.redisClient.hdel(`table:dirty-times:${table.branchId}`, table.id);
      await this.redisClient.srem(`table:dirty-alerted:${table.branchId}`, table.id);
    }

    if (dto.status === RestaurantTableStatus.OCCUPIED) {
      await this.redisClient.hset(`table:occupied-times:${table.branchId}`, table.id, Date.now().toString());
    } else {
      await this.redisClient.hdel(`table:occupied-times:${table.branchId}`, table.id);
    }

    const result = { ...updated, dirtySince };

    try {
      this.tablesGateway?.notifyTableStatusChanged(table.branchId, result);
    } catch {
      // Bỏ qua lỗi phát sóng socket nếu có
    }

    return result;
  }

  async getTableTurnoverStats(branchId: string, user?: ICurrentUser) {
    if (user && user.role === Role.STAFF) {
      if (user.branchId && user.branchId !== branchId) {
        throw new ForbiddenException('Bạn không có quyền truy cập thông tin chi nhánh này.');
      }
    }

    // Tự động kiểm tra các bàn quá thời gian dùng bữa để chuyển DIRTY trước khi trả về thống kê
    await this.checkAndAutoExpireSeatedTables().catch((err) => {
      this.logger.warn(
        `Auto-expire during turnover stats failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    const now = getLocalNow();
    const [tables, dirtyTimes, todayReservations, locks] = await Promise.all([
      this.prisma.restaurantTable.findMany({
        where: {
          branchId,
          isActive: true,
        },
        orderBy: [{ floor: 'asc' }, { tableNumber: 'asc' }],
        include: {
          tableType: true,
        },
      }),
      this.redisClient.hgetall(`table:dirty-times:${branchId}`),
      this.prisma.reservation.findMany({
        where: {
          branchId,
          reservationDate: toDateOnly(now.date),
          status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
          OR: [{ tableId: { not: null } }, { reservationTables: { some: {} } }],
        },
        select: {
          tableId: true,
          reservationTables: { select: { tableId: true } },
          reservationTime: true,
          customerName: true,
          guestCount: true,
        },
        orderBy: { reservationTime: 'asc' },
      }),
      this.tableLockService.getActiveLocks(branchId, now.date),
    ]);

    // Map lượt đặt bàn tiếp theo trong ngày cho từng bàn
    const nextReservationMap = new Map<
      string,
      { reservationTime: string; customerName: string; guestCount: number }
    >();
    for (const res of todayReservations) {
      const resMins = timeStringToMinutes(res.reservationTime);
      if (resMins < now.minutes) continue;
      for (const tableId of getReservationTableIds(res)) {
        if (!nextReservationMap.has(tableId)) {
          nextReservationMap.set(tableId, {
            reservationTime: res.reservationTime,
            customerName: res.customerName,
            guestCount: res.guestCount,
          });
        }
      }
    }

    let available = 0;
    let locked = 0;
    let occupied = 0;
    let dirty = 0;
    let maintenance = 0;

    type TurnoverTable = (typeof tables)[number] & {
      dirtySince: number | null;
      lockStatus: {
        isLocked: boolean;
        lockedByMe: boolean;
        expiresIn: number | null;
      };
      nextReservation: {
        reservationTime: string;
        customerName: string;
        guestCount: number;
      } | null;
      isReserved: boolean;
    };
    const floorMap = new Map<number, TurnoverTable[]>();

    for (const t of tables) {
      const activeLock = locks.find((l) => l.tableId === t.id);
      if (activeLock) locked++;

      if (t.status === RestaurantTableStatus.AVAILABLE) available++;
      else if (t.status === RestaurantTableStatus.OCCUPIED) occupied++;
      else if (t.status === RestaurantTableStatus.DIRTY) dirty++;
      else if (t.status === RestaurantTableStatus.MAINTENANCE) maintenance++;

      const dirtyTimestampStr = dirtyTimes[t.id];
      const dirtySince =
        t.status === RestaurantTableStatus.DIRTY
          ? dirtyTimestampStr
            ? Number(dirtyTimestampStr)
            : Date.now()
          : null;

      const nextRes = nextReservationMap.get(t.id) || null;
      const tableWithMeta = {
        ...t,
        dirtySince,
        lockStatus: {
          isLocked: !!activeLock,
          lockedByMe: false,
          expiresIn: activeLock?.ttl || null,
        },
        nextReservation: nextRes,
        isReserved: !!nextRes,
      };

      const list = floorMap.get(t.floor) || [];
      list.push(tableWithMeta);
      floorMap.set(t.floor, list);
    }

    const totalActive = tables.length;
    const occupancyRate =
      totalActive > 0 ? Math.round((occupied / totalActive) * 100) : 0;

    const floors = Array.from(floorMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([floor, floorTables]) => ({
        floor,
        tables: floorTables,
      }));

    return {
      branchId,
      summary: {
        total: totalActive,
        available,
        locked,
        occupied,
        dirty,
        maintenance,
        occupancyRate,
      },
      floors,
    };
  }

  /**
   * Bổ sung dữ liệu realtime (khóa giữ chỗ Redis, đơn đặt hôm nay, thời gian dọn) vào danh sách bàn
   */
  private async enrichTablesWithRealtimeData<
    T extends { id: string; branchId: string; status: RestaurantTableStatus },
  >(tables: T[], branchId?: string) {
    if (!tables || tables.length === 0) return [];

    const now = getLocalNow();
    const today = toDateOnly(now.date);
    const tableIds = tables.map((t) => t.id);

    const branchIds =
      branchId && branchId !== 'ALL'
        ? [branchId]
        : Array.from(new Set<string>(tables.map((t) => t.branchId).filter(Boolean)));

    const [locks, dirtyTimesList, todayReservations] = await Promise.all([
      this.tableLockService.getActiveLocks(branchId, now.date),
      Promise.all(branchIds.map((bId) => this.redisClient.hgetall(`table:dirty-times:${bId}`))),
      this.prisma.reservation.findMany({
        where: {
          reservationDate: today,
          status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
          OR: [
            { tableId: { in: tableIds } },
            { reservationTables: { some: { tableId: { in: tableIds } } } },
          ],
        },
        select: {
          id: true,
          tableId: true,
          reservationTables: { select: { tableId: true } },
          reservationTime: true,
          customerName: true,
          guestCount: true,
          status: true,
        },
        orderBy: { reservationTime: 'asc' },
      }),
    ]);

    const dirtyTimesMap = new Map<string, string>();
    dirtyTimesList.forEach((dt) => {
      Object.entries(dt).forEach(([tId, timeStr]) => dirtyTimesMap.set(tId, timeStr));
    });

    const nextReservationMap = new Map<
      string,
      { reservationTime: string; customerName: string; guestCount: number; status: string }
    >();
    for (const res of todayReservations) {
      const resMins = timeStringToMinutes(res.reservationTime);
      // Đơn đặt trong ngày chưa qua quá 60 phút
      if (resMins < now.minutes - 60) continue;
      for (const tableId of getReservationTableIds(res)) {
        if (!nextReservationMap.has(tableId)) {
          nextReservationMap.set(tableId, {
            reservationTime: res.reservationTime,
            customerName: res.customerName,
            guestCount: res.guestCount,
            status: res.status,
          });
        }
      }
    }

    return tables.map((t) => {
      const activeLock = locks.find((l) => l.tableId === t.id);
      const nextRes = nextReservationMap.get(t.id);
      const dirtyTimestampStr = dirtyTimesMap.get(t.id);
      const dirtySince =
        t.status === RestaurantTableStatus.DIRTY
          ? dirtyTimestampStr
            ? Number(dirtyTimestampStr)
            : Date.now()
          : null;

      return {
        ...t,
        dirtySince,
        lockStatus: {
          isLocked: !!activeLock,
          lockedByMe: false,
          expiresIn: activeLock?.ttl || null,
        },
        nextReservation: nextRes || null,
        isReserved: !!nextRes,
      };
    });
  }

  /**
   * Tự động quét và chuyển trạng thái các bàn đang OCCUPIED có khách SEATED đã dùng bữa quá thời lượng slot
   * sang trạng thái DIRTY (Cần dọn dẹp), đồng thời hoàn thành đơn đặt bàn (COMPLETED).
   */
  async checkAndAutoExpireSeatedTables(): Promise<void> {
    const now = getLocalNow();
    const today = toDateOnly(now.date);

    const seatedReservations = await this.prisma.reservation.findMany({
      where: {
        reservationDate: today,
        status: ReservationStatus.SEATED,
        OR: [{ tableId: { not: null } }, { reservationTables: { some: {} } }],
      },
      include: {
        table: true,
        reservationTables: { include: { table: true } },
      },
    });

    for (const res of seatedReservations) {
      const targetTables = new Map<string, { id: string; tableNumber: string }>();
      for (const rt of res.reservationTables) {
        targetTables.set(rt.table.id, { id: rt.table.id, tableNumber: rt.table.tableNumber });
      }
      if (res.table) {
        targetTables.set(res.table.id, { id: res.table.id, tableNumber: res.table.tableNumber });
      }
      const resTables = Array.from(targetTables.values());
      if (resTables.length === 0) continue;

      const duration = res.slotDurationMinutes;
      if (duration <= 0) continue;

      let startMins = timeStringToMinutes(res.reservationTime);
      if (res.updatedAt) {
        const updatedLocal = getLocalNow(res.updatedAt);
        if (updatedLocal.date === now.date) {
          startMins = Math.max(startMins, updatedLocal.minutes);
        }
      }

      const expiredAtMins = startMins + duration;

      if (now.minutes >= expiredAtMins) {
        try {
          const tableIds = resTables.map((t) => t.id);
          const updatedRes = await this.prisma.$transaction(async (tx) => {
            const claim = await tx.reservation.updateMany({
              where: {
                id: res.id,
                status: ReservationStatus.SEATED,
              },
              data: { status: ReservationStatus.COMPLETED },
            });
            if (claim.count === 0) return null;

            await tx.restaurantTable.updateMany({
              where: { id: { in: tableIds } },
              data: {
                status: RestaurantTableStatus.DIRTY,
                note: `Bữa ăn kết thúc tự động sau ${duration} phút (${res.reservationCode})`,
              },
            });

            return tx.reservation.findUnique({
              where: { id: res.id },
              include: { branch: true, table: true, orders: { include: { menuItem: true } } },
            });
          });

          if (!updatedRes) continue;

          const dirtySince = Date.now();
          for (const tbl of resTables) {
            await this.redisClient.hset(
              `table:dirty-times:${res.branchId}`,
              tbl.id,
              dirtySince.toString(),
            );
            await this.redisClient.hdel(`table:occupied-times:${res.branchId}`, tbl.id);

            this.tablesGateway?.notifyTableStatusChanged(res.branchId, {
              id: tbl.id,
              status: RestaurantTableStatus.DIRTY,
              dirtySince,
              tableNumber: tbl.tableNumber,
              note: `Khách vừa dùng bữa xong (${res.reservationCode})`,
            });
          }
          this.tablesGateway?.notifyReservationUpdated(res.branchId, updatedRes);
          this.notificationsService.onReservationAutoCompleted(updatedRes).catch((err) => {
            this.logger.warn(
              `[Notification] Gửi thông báo tự động kết thúc bữa ăn thất bại (${res.reservationCode}): ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        } catch (err) {
          this.logger.warn(
            `Failed to auto-expire reservation ${res.reservationCode}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  /**
   * Hủy các giao dịch cọc và đơn AWAITING_PAYMENT quá hạn thanh toán (mặc định 15 phút), giải phóng khóa giữ bàn.
   */
  async expireUnpaidReservations(): Promise<void> {
    const now = new Date();
    const expiredPayments = await this.prisma.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.PENDING,
        purpose: PaymentPurpose.RESERVATION_DEPOSIT,
        expiresAt: { lte: now },
        reservationId: { not: null },
      },
      include: {
        reservation: {
          select: {
            id: true,
            reservationCode: true,
            userId: true,
            branchId: true,
            status: true,
            tableId: true,
            reservationDate: true,
            reservationTime: true,
            reservationTables: { select: { tableId: true } },
          },
        },
      },
    });

    for (const payment of expiredPayments) {
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentTransaction.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.EXPIRED },
        });
        if (payment.reservationId) {
          await tx.reservation.updateMany({
            where: {
              id: payment.reservationId,
              status: ReservationStatus.AWAITING_PAYMENT,
            },
            data: {
              status: ReservationStatus.CANCELLED,
              cancelledReason: 'Quá thời gian thanh toán tiền cọc.',
            },
          });
        }
      });

      if (payment.reservation && payment.reservation.status === ReservationStatus.AWAITING_PAYMENT) {
        const tableIds = getReservationTableIds(payment.reservation);
        if (tableIds.length > 0) {
          const dateStr = payment.reservation.reservationDate.toISOString().slice(0, 10);
          await this.tableLockService.releaseSlotLocksByIds(
            payment.reservation.branchId,
            tableIds,
            dateStr,
            payment.reservation.reservationTime,
          );
          try {
            this.tablesGateway?.notifyTablesReleased({
              branchId: payment.reservation.branchId,
              tableIds,
              date: dateStr,
              time: payment.reservation.reservationTime,
            });
          } catch {
            // Bỏ qua lỗi socket
          }
        }

        if (payment.reservation.userId) {
          this.notificationsService
            .onReservationDepositExpired({
              userId: payment.reservation.userId,
              reservationId: payment.reservation.id,
              reservationCode: payment.reservation.reservationCode,
              branchId: payment.reservation.branchId,
            })
            .catch(() => {});
        }
      }
    }

    // Dọn các đơn AWAITING_PAYMENT mồ côi quá 20 phút chưa gắn giao dịch đang chờ
    const orphanCutoff = new Date(Date.now() - 20 * 60 * 1000);
    await this.prisma.reservation.updateMany({
      where: {
        status: ReservationStatus.AWAITING_PAYMENT,
        createdAt: { lte: orphanCutoff },
      },
      data: {
        status: ReservationStatus.CANCELLED,
        cancelledReason: 'Quá thời gian giữ chỗ chờ thanh toán.',
      },
    });
  }

  /**
   * Cảnh báo cho Staff khi bàn ở trạng thái DIRTY (Cần dọn dẹp) quá lâu (mặc định 15 phút).
   */
  async checkDirtyTableOverdues(): Promise<void> {
    const thresholdMinutes = Number(process.env.TABLE_DIRTY_ALERT_MINUTES) || 15;
    const thresholdMs = thresholdMinutes * 60 * 1000;
    const nowMs = Date.now();

    const dirtyTables = await this.prisma.restaurantTable.findMany({
      where: {
        status: RestaurantTableStatus.DIRTY,
        isActive: true,
      },
      select: {
        id: true,
        branchId: true,
        tableNumber: true,
      },
    });

    if (dirtyTables.length === 0) return;

    const branchIds = Array.from(new Set(dirtyTables.map((t) => t.branchId)));
    for (const branchId of branchIds) {
      const dirtyMap = await this.redisClient.hgetall(`table:dirty-times:${branchId}`);
      const alertedSet = await this.redisClient.smembers(`table:dirty-alerted:${branchId}`);
      const alerted = new Set(alertedSet);

      const branchDirtyTables = dirtyTables.filter((t) => t.branchId === branchId);
      for (const tbl of branchDirtyTables) {
        if (alerted.has(tbl.id)) continue;
        const sinceRaw = dirtyMap[tbl.id];
        const sinceMs = sinceRaw ? Number(sinceRaw) : 0;
        if (!sinceMs || nowMs - sinceMs < thresholdMs) continue;

        const added = await this.redisClient.sadd(`table:dirty-alerted:${branchId}`, tbl.id);
        await this.redisClient.expire(`table:dirty-alerted:${branchId}`, 86400);
        if (added === 1) {
          this.notificationsService
            .onTableDirtyOverdue({
              branchId,
              tableId: tbl.id,
              tableNumber: tbl.tableNumber,
              minutesDirty: Math.floor((nowMs - sinceMs) / 60000),
            })
            .catch(() => {});
        }
      }
    }
  }

  async bulkCleanTables(
    branchId: string,
    dto: BulkCleanTablesDto,
    user?: ICurrentUser,
  ) {
    if (user && user.role === Role.STAFF) {
      if (user.branchId && user.branchId !== branchId) {
        throw new ForbiddenException('Bạn không có quyền quản lý bàn của chi nhánh này.');
      }
    }

    const where: Prisma.RestaurantTableWhereInput = {
      branchId,
      isActive: true,
    };

    if (dto.tableIds && dto.tableIds.length > 0) {
      where.id = { in: dto.tableIds };
    } else {
      where.status = RestaurantTableStatus.DIRTY;
    }

    const targetTables = await this.prisma.restaurantTable.findMany({
      where,
      select: { id: true, tableNumber: true },
    });

    if (targetTables.length === 0) {
      return {
        count: 0,
        cleanedTables: [],
        message: 'Không có bàn nào cần dọn dẹp.',
      };
    }

    const targetIds = targetTables.map((t) => t.id);

    await this.prisma.restaurantTable.updateMany({
      where: { id: { in: targetIds } },
      data: {
        status: RestaurantTableStatus.AVAILABLE,
        note: dto.note !== undefined ? dto.note : null,
      },
    });

    if (targetIds.length > 0) {
      await this.redisClient.hdel(`table:dirty-times:${branchId}`, ...targetIds);
      await this.redisClient.srem(`table:dirty-alerted:${branchId}`, ...targetIds);
    }

    try {
      for (const table of targetTables) {
        this.tablesGateway?.notifyTableStatusChanged(branchId, {
          id: table.id,
          status: RestaurantTableStatus.AVAILABLE,
          dirtySince: null,
        });
      }
    } catch {
      // Bỏ qua lỗi phát sóng socket nếu có
    }

    return {
      count: targetIds.length,
      cleanedTables: targetTables,
      message: `Đã dọn sạch ${targetIds.length} bàn thành công.`,
    };
  }
}
