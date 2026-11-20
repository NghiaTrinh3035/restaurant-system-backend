import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import Redis from 'ioredis';
import { SearchAvailableTablesDto } from '../dto/search-available-tables.dto';
import { RestaurantBranchStatus, RestaurantTableStatus, Role } from '@prisma/client';
import {
  ACTIVE_RESERVATION_STATUSES,
  MAX_RESERVATION_TABLES,
  getLocalNow,
  getReservationTableIds,
  isTimeRangeOverlap,
  timeStringToMinutes,
  toDateOnly,
} from 'src/modules/reservations/helpers/reservation.helper';

export interface ITableLockInfo {
  tableId: string;
  branchId: string;
  date: string;
  time: string;
  lockedBy: string;
  userEmail: string;
  lockedAt: string;
  expiresAt: string;
  tableNumber?: string;
}

export interface ITableSlot {
  branchId: string;
  tableId: string;
  date: string;
  time: string;
}

export interface IStoredLock extends ITableLockInfo {
  ttl: number;
}

const LOCK_PREFIX = 'table:lock';
const OWNER_PREFIX = 'table:lock-owners';

@Injectable()
export class TableLockService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  /**
   * Tìm bàn cho một khung giờ cụ thể (ngày + giờ đến) theo số khách.
   * Bàn bị coi là đã đặt nếu có đơn trùng khung giờ, hoặc đang có khách ngồi khi khung giờ đặt sát hiện tại.
   */
  async searchAvailableTables(dto: SearchAvailableTablesDto, currentUserId?: string) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
      select: { id: true, status: true, slotDurationMinutes: true },
    });

    if (!branch || branch.status !== RestaurantBranchStatus.ACTIVE) {
      throw new NotFoundException('Chi nhánh không tồn tại hoặc đã ngừng hoạt động.');
    }

    const duration = dto.durationMinutes && dto.durationMinutes > 0 ? dto.durationMinutes : (branch.slotDurationMinutes || 90);
    const startMins = timeStringToMinutes(dto.time);

    const tables = await this.prisma.restaurantTable.findMany({
      where: {
        branchId: dto.branchId,
        isActive: true,
        status: { not: RestaurantTableStatus.MAINTENANCE },
      },
      include: {
        tableType: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: [{ floor: 'asc' }, { tableType: { capacity: 'asc' } }, { tableNumber: 'asc' }],
    });

    const candidateTables = tables.filter((t) => !dto.floor || t.floor === dto.floor);

    const reservedIds = await this.getReservedTableIds(dto.branchId, dto.date, startMins, duration);
    const occupiedBlocks = this.isNearNow(dto.date, startMins, duration);
    const locks = await this.getLocksOnDate(dto.branchId, dto.date);

    const results: Array<
      (typeof tables)[number] & {
        isReserved: boolean;
        lockStatus: { isLocked: boolean; lockedByMe: boolean; expiresIn: number | null };
      }
    > = [];
    for (const table of candidateTables) {
      const overlappingLocks = locks.filter(
        (l) =>
          l.tableId === table.id &&
          isTimeRangeOverlap(startMins, duration, timeStringToMinutes(l.time), duration),
      );
      const myLock = currentUserId ? overlappingLocks.find((l) => l.lockedBy === currentUserId) : undefined;
      const otherLock = overlappingLocks.find((l) => l.lockedBy !== currentUserId);
      const activeLock = myLock || otherLock;

      if (!dto.includeLocked && otherLock) continue;

      results.push({
        ...table,
        isReserved:
          reservedIds.has(table.id) || (occupiedBlocks && table.status === RestaurantTableStatus.OCCUPIED),
        lockStatus: {
          isLocked: !!activeLock,
          lockedByMe: !!myLock,
          expiresIn: activeLock && activeLock.ttl > 0 ? activeLock.ttl : null,
        },
      });
    }

    return results;
  }

  /**
   * Giữ bàn tạm thời cho một khung giờ (mặc định 10 phút). Cho phép giữ tối đa MAX_RESERVATION_TABLES bàn
   * trong cùng khung giờ (chi nhánh + ngày + giờ); đổi khung giờ hoặc chi nhánh sẽ nhả các bàn cũ.
   */
  async lockTable(
    slot: ITableSlot & { guestCount?: number },
    user: { id: string; email: string },
    ttlSeconds = 600,
  ): Promise<{ success: boolean; reason?: string; lockInfo?: ITableLockInfo; releasedLocks?: ITableLockInfo[] }> {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: slot.tableId, branchId: slot.branchId, isActive: true },
      include: { tableType: true, branch: { select: { slotDurationMinutes: true, status: true } } },
    });

    if (!table || table.branch.status !== RestaurantBranchStatus.ACTIVE) {
      return { success: false, reason: 'Bàn không tồn tại tại chi nhánh này.' };
    }
    if (table.status === RestaurantTableStatus.MAINTENANCE) {
      return { success: false, reason: 'Bàn đang bảo trì, vui lòng chọn bàn khác.' };
    }
    if (table.status === RestaurantTableStatus.DIRTY) {
      return { success: false, reason: 'Bàn đang được nhân viên dọn dẹp, vui lòng chọn bàn khác hoặc chờ trong giây lát.' };
    }

    const duration = table.branch.slotDurationMinutes || 90;
    const startMins = timeStringToMinutes(slot.time);
    const now = getLocalNow();
    if (slot.date < now.date || (slot.date === now.date && startMins <= now.minutes)) {
      return { success: false, reason: 'Khung giờ đã qua, vui lòng chọn lại thời gian.' };
    }

    const reservedIds = await this.getReservedTableIds(slot.branchId, slot.date, startMins, duration, slot.tableId);
    if (reservedIds.has(slot.tableId)) {
      return { success: false, reason: 'Bàn đã có khách đặt trong khung giờ này.' };
    }
    if (this.isNearNow(slot.date, startMins, duration) && table.status === RestaurantTableStatus.OCCUPIED) {
      return { success: false, reason: 'Bàn đang có khách sử dụng, vui lòng chọn bàn khác.' };
    }

    if (await this.hasBlockingLock(slot, user.id, duration)) {
      return { success: false, reason: 'Bàn này đang được giữ bởi khách hàng khác.' };
    }

    const key = this.lockKey(slot);
    const { sameSlotKeys, releasedLocks } = await this.reconcileUserLocksForSlot(user.id, slot);

    if (!sameSlotKeys.includes(key) && sameSlotKeys.length >= MAX_RESERVATION_TABLES) {
      return {
        success: false,
        reason: `Bạn chỉ có thể giữ tối đa ${MAX_RESERVATION_TABLES} bàn cùng lúc cho một đơn đặt bàn.`,
        releasedLocks,
      };
    }

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const lockPayload: ITableLockInfo = {
      tableId: slot.tableId,
      branchId: slot.branchId,
      date: slot.date,
      time: slot.time,
      lockedBy: user.id,
      userEmail: user.email,
      lockedAt: new Date().toISOString(),
      expiresAt,
      tableNumber: table.tableNumber,
    };

    // Atomic SET NX EX; nếu chính user đang giữ khóa này thì gia hạn
    const acquired = await this.redisClient.set(key, JSON.stringify(lockPayload), 'EX', ttlSeconds, 'NX');
    if (!acquired) {
      const existing = this.parseLock(await this.redisClient.get(key));
      if (existing?.lockedBy !== user.id) {
        return { success: false, reason: 'Bàn này đang được giữ bởi khách hàng khác.', releasedLocks };
      }
      await this.redisClient.set(key, JSON.stringify(lockPayload), 'EX', ttlSeconds);
    }

    // Chống race: người khác vừa giữ cùng bàn ở khung giờ chồng lấn
    if (await this.hasBlockingLock(slot, user.id, duration)) {
      await this.redisClient.del(key);
      return { success: false, reason: 'Bàn này vừa được khách hàng khác giữ.', releasedLocks };
    }

    const ownerSet = this.ownerKey(user.id);
    await this.redisClient.sadd(ownerSet, key);
    await this.redisClient.expire(ownerSet, ttlSeconds);

    // Đồng bộ thời gian hết hạn cho các bàn cùng khung giờ mà khách đang giữ
    for (const existingKey of sameSlotKeys) {
      if (existingKey !== key) {
        await this.redisClient.expire(existingKey, ttlSeconds);
      }
    }

    return { success: true, lockInfo: lockPayload, releasedLocks };
  }

  /**
   * Mở khóa bàn (chủ khóa hoặc Staff/Admin)
   */
  async releaseTable(
    slot: ITableSlot,
    user: { id: string; role: Role },
  ): Promise<{ success: boolean; reason?: string }> {
    const key = this.lockKey(slot);
    const existing = this.parseLock(await this.redisClient.get(key));
    if (!existing) {
      return { success: true };
    }

    const isOwner = existing.lockedBy === user.id;
    const isStaffOrAdmin = user.role === Role.ADMIN || user.role === Role.STAFF;
    if (!isOwner && !isStaffOrAdmin) {
      return { success: false, reason: 'Bạn không có quyền mở khóa bàn của người khác.' };
    }

    await this.deleteLock(key, existing.lockedBy);
    return { success: true };
  }

  /** ID người đang giữ bàn cho đúng khung giờ (null nếu không ai giữ / đã hết hạn) */
  async getLockOwner(slot: ITableSlot): Promise<string | null> {
    const existing = this.parseLock(await this.redisClient.get(this.lockKey(slot)));
    return existing?.lockedBy ?? null;
  }

  /** Xóa khóa sau khi đơn đặt bàn đã được xác nhận */
  async consumeLock(slot: ITableSlot, userId: string): Promise<void> {
    const key = this.lockKey(slot);
    const existing = this.parseLock(await this.redisClient.get(key));
    if (existing?.lockedBy === userId) {
      await this.deleteLock(key, userId);
    }
  }

  /** Xóa toàn bộ khóa của một đơn đặt nhiều bàn sau khi đã xác nhận */
  async consumeSlotLocks(
    branchId: string,
    tableIds: string[],
    date: string,
    time: string,
    userId: string | null,
  ): Promise<void> {
    for (const tableId of tableIds) {
      const key = this.lockKey({ branchId, tableId, date, time });
      const existing = this.parseLock(await this.redisClient.get(key));
      if (!existing) continue;
      if (!userId || existing.lockedBy === userId) {
        await this.deleteLock(key, existing.lockedBy);
      }
    }
  }

  /** Gia hạn khóa (ví dụ 15 phút khi khách đang ở cổng thanh toán) */
  async extendSlotLocks(
    branchId: string,
    tableIds: string[],
    date: string,
    time: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const ownerSet = this.ownerKey(userId);
    for (const tableId of tableIds) {
      const key = this.lockKey({ branchId, tableId, date, time });
      const existing = this.parseLock(await this.redisClient.get(key));
      if (existing && existing.lockedBy === userId) {
        const updated: ITableLockInfo = { ...existing, expiresAt };
        await this.redisClient.set(key, JSON.stringify(updated), 'EX', ttlSeconds);
        await this.redisClient.sadd(ownerSet, key);
      }
    }
    await this.redisClient.expire(ownerSet, ttlSeconds);
  }

  /** Giải phóng khóa theo danh sách bàn (khi thanh toán hủy/lỗi/hết hạn) */
  async releaseSlotLocksByIds(
    branchId: string,
    tableIds: string[],
    date: string,
    time: string,
  ): Promise<ITableLockInfo[]> {
    const released: ITableLockInfo[] = [];
    for (const tableId of tableIds) {
      const key = this.lockKey({ branchId, tableId, date, time });
      const existing = this.parseLock(await this.redisClient.get(key));
      if (!existing) continue;
      await this.deleteLock(key, existing.lockedBy);
      released.push(existing);
    }
    return released;
  }

  private lockKey(slot: ITableSlot): string {
    return `${LOCK_PREFIX}:${slot.branchId}:${slot.tableId}:${slot.date}:${slot.time}`;
  }

  private ownerKey(userId: string): string {
    return `${OWNER_PREFIX}:${userId}`;
  }

  private parseLock(raw: string | null): ITableLockInfo | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ITableLockInfo;
    } catch {
      return null;
    }
  }

  private async deleteLock(key: string, ownerId: string): Promise<void> {
    await this.redisClient.del(key);
    await this.redisClient.srem(this.ownerKey(ownerId), key);
  }

  private async reconcileUserLocksForSlot(
    userId: string,
    targetSlot: ITableSlot,
  ): Promise<{ sameSlotKeys: string[]; releasedLocks: ITableLockInfo[] }> {
    const ownerSet = this.ownerKey(userId);
    const keys = await this.redisClient.smembers(ownerSet);
    if (keys.length === 0) {
      return { sameSlotKeys: [], releasedLocks: [] };
    }

    const raws = await this.redisClient.mget(keys);
    const sameSlotKeys: string[] = [];
    const releasedLocks: ITableLockInfo[] = [];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const info = this.parseLock(raws[i]);
      if (!info || info.lockedBy !== userId) {
        await this.redisClient.srem(ownerSet, key);
        continue;
      }

      const sameSlot =
        info.branchId === targetSlot.branchId &&
        info.date === targetSlot.date &&
        info.time === targetSlot.time;

      if (sameSlot) {
        sameSlotKeys.push(key);
      } else {
        await this.redisClient.del(key);
        await this.redisClient.srem(ownerSet, key);
        releasedLocks.push(info);
      }
    }

    return { sameSlotKeys, releasedLocks };
  }

  private async hasBlockingLock(slot: ITableSlot, userId: string, duration: number): Promise<boolean> {
    const startMins = timeStringToMinutes(slot.time);
    const locks = await this.getLocksOnDate(slot.branchId, slot.date, slot.tableId);
    return locks.some(
      (l) =>
        l.lockedBy !== userId &&
        isTimeRangeOverlap(startMins, duration, timeStringToMinutes(l.time), duration),
    );
  }

  /**
   * Lấy danh sách các khóa giữ bàn còn hiệu lực trong Redis theo chi nhánh / ngày / bàn
   */
  async getActiveLocks(branchId?: string, date?: string, tableId = '*'): Promise<IStoredLock[]> {
    const branchPattern = branchId && branchId !== 'ALL' ? branchId : '*';
    const datePattern = date || '*';
    const pattern = `${LOCK_PREFIX}:${branchPattern}:${tableId}:${datePattern}:*`;
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return [];

    const [values, ttls] = await Promise.all([
      this.redisClient.mget(keys),
      Promise.all(keys.map((k) => this.redisClient.ttl(k))),
    ]);

    const locks: IStoredLock[] = [];
    values.forEach((raw, i) => {
      const parsed = this.parseLock(raw);
      if (parsed && ttls[i] > 0) locks.push({ ...parsed, ttl: ttls[i] });
    });
    return locks;
  }

  private async getLocksOnDate(branchId: string, date: string, tableId = '*'): Promise<IStoredLock[]> {
    return this.getActiveLocks(branchId, date, tableId);
  }

  private async getReservedTableIds(
    branchId: string,
    date: string,
    startMins: number,
    duration: number,
    tableId?: string,
  ): Promise<Set<string>> {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        branchId,
        reservationDate: toDateOnly(date),
        status: { in: ACTIVE_RESERVATION_STATUSES },
        ...(tableId
          ? {
              OR: [
                { tableId },
                { reservationTables: { some: { tableId } } },
              ],
            }
          : {
              OR: [
                { tableId: { not: null } },
                { reservationTables: { some: {} } },
              ],
            }),
      },
      select: {
        tableId: true,
        reservationTables: { select: { tableId: true } },
        reservationTime: true,
        slotDurationMinutes: true,
      },
    });

    const ids = new Set<string>();
    for (const r of reservations) {
      if (isTimeRangeOverlap(startMins, duration, timeStringToMinutes(r.reservationTime), r.slotDurationMinutes)) {
        for (const id of getReservationTableIds(r)) {
          ids.add(id);
        }
      }
    }
    return ids;
  }

  /** Khung giờ đặt sát hiện tại: khách đang ngồi bàn sẽ chưa kịp rời đi */
  private isNearNow(date: string, startMins: number, duration: number): boolean {
    const now = getLocalNow();
    return date === now.date && startMins < now.minutes + duration;
  }
}
