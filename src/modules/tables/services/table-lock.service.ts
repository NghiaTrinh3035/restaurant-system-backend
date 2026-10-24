import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import Redis from 'ioredis';
import { SearchAvailableTablesDto } from '../dto/search-available-tables.dto';
import { Prisma, RestaurantBranchStatus, RestaurantTableStatus, Role } from '@prisma/client';

export interface ITableLockInfo {
  tableId: string;
  branchId: string;
  lockedBy: string;
  userEmail: string;
  lockedAt: string;
  expiresAt: string;
  tableNumber?: string;
}

@Injectable()
export class TableLockService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  /**
   * Tìm kiếm các bàn trống theo chi nhánh, số lượng khách và tầng
   * Có tích hợp kiểm tra tình trạng lock tạm thời trên Redis
   */
  async searchAvailableTables(dto: SearchAvailableTablesDto, currentUserId?: string) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
      select: { id: true, name: true, status: true },
    });

    if (!branch || branch.status !== RestaurantBranchStatus.ACTIVE) {
      throw new NotFoundException('Chi nhánh không tồn tại hoặc đã ngừng hoạt động.');
    }

    const where: Prisma.RestaurantTableWhereInput = {
      branchId: dto.branchId,
      isActive: true,
      status: RestaurantTableStatus.AVAILABLE,
      tableType: {
        capacity: {
          gte: dto.partySize,
        },
      },
    };

    if (dto.floor) {
      where.floor = dto.floor;
    }

    const tables = await this.prisma.restaurantTable.findMany({
      where,
      include: {
        tableType: true,
        branch: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { floor: 'asc' },
        { tableType: { capacity: 'asc' } }, // Ưu tiên xếp bàn vừa vặn số khách
        { tableNumber: 'asc' },
      ],
    });

    const results: any[] = [];
    for (const table of tables) {
      const lockKey = `table:lock:${dto.branchId}:${table.id}`;
      const lockData = await this.redisClient.get(lockKey);

      let isLocked = false;
      let lockedByMe = false;
      let expiresIn: number | null = null;

      if (lockData) {
        isLocked = true;
        try {
          const parsed = JSON.parse(lockData);
          if (currentUserId && parsed.userId === currentUserId) {
            lockedByMe = true;
          }
        } catch {
          if (currentUserId && lockData === currentUserId) {
            lockedByMe = true;
          }
        }
        const ttl = await this.redisClient.ttl(lockKey);
        expiresIn = ttl > 0 ? ttl : null;
      }

      // Nếu client chỉ muốn lấy bàn hoàn toàn trống thì bỏ qua bàn đang bị lock bởi người khác
      if (!dto.includeLocked && isLocked && !lockedByMe) {
        continue;
      }

      results.push({
        ...table,
        lockStatus: {
          isLocked,
          lockedByMe,
          expiresIn,
        },
      });
    }

    return results;
  }

  /**
   * Giữ bàn tạm thời (Lock bàn 10 phút) thông qua Redis SET NX EX
   */
  async lockTable(
    branchId: string,
    tableId: string,
    user: { id: string; email: string },
    ttlSeconds = 600,
  ): Promise<{ success: boolean; reason?: string; lockInfo?: ITableLockInfo }> {
    const table = await this.prisma.restaurantTable.findFirst({
      where: {
        id: tableId,
        branchId,
        isActive: true,
      },
      include: { tableType: true },
    });

    if (!table) {
      return { success: false, reason: 'Bàn không tồn tại tại chi nhánh này.' };
    }

    if (table.status !== RestaurantTableStatus.AVAILABLE) {
      return { success: false, reason: `Bàn hiện không thể đặt (Trạng thái: ${table.status}).` };
    }

    const lockKey = `table:lock:${branchId}:${tableId}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const lockPayload: ITableLockInfo = {
      tableId,
      branchId,
      lockedBy: user.id,
      userEmail: user.email,
      lockedAt: new Date().toISOString(),
      expiresAt,
      tableNumber: table.tableNumber,
    };

    // Atomic SET NX EX
    const acquired = await this.redisClient.set(
      lockKey,
      JSON.stringify(lockPayload),
      'EX',
      ttlSeconds,
      'NX',
    );

    if (!acquired) {
      // Nếu chính user này đang giữ khóa -> gia hạn khóa
      const existing = await this.redisClient.get(lockKey);
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (parsed.userId === user.id || parsed.lockedBy === user.id) {
            await this.redisClient.set(lockKey, JSON.stringify(lockPayload), 'EX', ttlSeconds);
            return {
              success: true,
              lockInfo: lockPayload,
            };
          }
        } catch {}
      }
      return { success: false, reason: 'Bàn này đang được giữ bởi khách hàng khác.' };
    }

    return {
      success: true,
      lockInfo: lockPayload,
    };
  }

  /**
   * Mở khóa bàn (Release lock)
   */
  async releaseTable(
    branchId: string,
    tableId: string,
    user: { id: string; role: Role },
  ): Promise<{ success: boolean; reason?: string }> {
    const lockKey = `table:lock:${branchId}:${tableId}`;
    const existing = await this.redisClient.get(lockKey);

    if (!existing) {
      return { success: true };
    }

    let parsedUserId: string | null = null;
    try {
      const parsed = JSON.parse(existing);
      parsedUserId = parsed.userId || parsed.lockedBy;
    } catch {
      parsedUserId = existing;
    }

    const isOwner = parsedUserId === user.id;
    const isStaffOrAdmin = user.role === Role.ADMIN || user.role === Role.STAFF;

    if (!isOwner && !isStaffOrAdmin) {
      return { success: false, reason: 'Bạn không có quyền mở khóa bàn của người khác.' };
    }

    await this.redisClient.del(lockKey);
    return { success: true };
  }

  /**
   * Lấy thông tin khóa hiện tại của một bàn (nếu có)
   */
  async getTableLock(branchId: string, tableId: string): Promise<ITableLockInfo | null> {
    const lockKey = `table:lock:${branchId}:${tableId}`;
    const data = await this.redisClient.get(lockKey);
    if (!data) return null;
    try {
      return JSON.parse(data) as ITableLockInfo;
    } catch {
      return null;
    }
  }
}
