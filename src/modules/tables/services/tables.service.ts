import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRestaurantTableDto } from '../dto/restaurant-table.dto';
import { CreateTableTypeDto } from '../dto/table-type.dto';
import { UpdateRestaurantTableDto } from '../dto/update-restaurant-table.dto';
import { UpdateTableTypeDto } from '../dto/update-table-type.dto';
import { BulkCreateRestaurantTableDto } from '../dto/bulk-create-restaurant-table.dto';
import { QueryTableTypeDto } from '../dto/query-table-type.dto';
import { QueryRestaurantTableDto } from '../dto/query-restaurant-table.dto';
import { UpdateTableStatusDto } from '../dto/update-table-status.dto';
import { Prisma, RestaurantTableStatus, Role } from '@prisma/client';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // TABLE TYPE
  // ==========================================

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

  // ==========================================
  // RESTAURANT TABLE
  // ==========================================

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
      return this.prisma.restaurantTable.findMany({
        where,
        orderBy: [{ floor: 'asc' }, { tableNumber: 'asc' }],
        include: {
          tableType: true,
          branch: { select: { id: true, name: true } },
        },
      });
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

    return {
      items,
      meta: new PaginationMetaDto(page, limit, totalItems),
    };
  }

  async getRestaurantTablesByBranch(branchId: string) {
    return this.prisma.restaurantTable.findMany({
      where: {
        branchId,
        isActive: true,
      },
      orderBy: [{ floor: 'asc' }, { tableNumber: 'asc' }],
      include: {
        tableType: true,
      },
    });
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

    return this.prisma.restaurantTable.update({
      where: { id },
      data: dataToUpdate,
      include: {
        tableType: true,
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async getTableTurnoverStats(branchId: string, user?: ICurrentUser) {
    if (user && user.role === Role.STAFF) {
      if (user.branchId && user.branchId !== branchId) {
        throw new ForbiddenException('Bạn không có quyền truy cập thông tin chi nhánh này.');
      }
    }

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

    let available = 0;
    let occupied = 0;
    let dirty = 0;
    let maintenance = 0;

    const floorMap = new Map<number, typeof tables>();

    for (const t of tables) {
      if (t.status === RestaurantTableStatus.AVAILABLE) available++;
      else if (t.status === RestaurantTableStatus.OCCUPIED) occupied++;
      else if (t.status === RestaurantTableStatus.DIRTY) dirty++;
      else if (t.status === RestaurantTableStatus.MAINTENANCE) maintenance++;

      const list = floorMap.get(t.floor) || [];
      list.push(t);
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
        occupied,
        dirty,
        maintenance,
        occupancyRate,
      },
      floors,
    };
  }
}
