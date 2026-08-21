import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRestaurantTableDto } from '../dto/restaurant-table.dto';
import { CreateTableTypeDto } from '../dto/table-type.dto';
import { UpdateRestaurantTableDto } from '../dto/update-restaurant-table.dto';
import { UpdateTableTypeDto } from '../dto/update-table-type.dto';
import { BulkCreateRestaurantTableDto } from '../dto/bulk-create-restaurant-table.dto';
import { RestaurantTableStatus } from '@prisma/client';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) { }

  // ==========================================
  // TABLE TYPE
  // ==========================================

  async createTableType(dto: CreateTableTypeDto) {
    return this.prisma.tableType.create({ data: dto });
  }

  async getTableTypes() {
    return this.prisma.tableType.findMany();
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
    await this.getTableTypeById(id); // validate exists
    return this.prisma.tableType.update({
      where: { id },
      data: dto,
    });
  }

  async deleteTableType(id: string) {
    await this.getTableTypeById(id); // validate exists
    
    const tablesCount = await this.prisma.restaurantTable.count({
      where: { tableTypeId: id },
    });
    if (tablesCount > 0) {
      throw new ConflictException('Cannot delete table type as it is currently assigned to one or more tables');
    }

    return this.prisma.tableType.delete({
      where: { id },
    });
  }

  // ==========================================
  // RESTAURANT TABLE
  // ==========================================

  async createRestaurantTable(dto: CreateRestaurantTableDto) {
    // Validate branch exists
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Validate table type exists
    const tableType = await this.prisma.tableType.findUnique({
      where: { id: dto.tableTypeId },
    });
    if (!tableType) {
      throw new NotFoundException('Table type not found');
    }

    // Check duplicate table number in the same branch
    const existingTable = await this.prisma.restaurantTable.findFirst({
      where: {
        branchId: dto.branchId,
        tableNumber: dto.tableNumber,
      },
    });
    if (existingTable) {
      throw new ConflictException(`Table number ${dto.tableNumber} already exists in this branch`);
    }

    return this.prisma.restaurantTable.create({
      data: {
        ...dto,
        status: dto.status ?? RestaurantTableStatus.AVAILABLE,
      },
    });
  }

  async bulkCreateRestaurantTables(dto: BulkCreateRestaurantTableDto) {
    // Validate branch exists
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Validate table type exists
    const tableType = await this.prisma.tableType.findUnique({
      where: { id: dto.tableTypeId },
    });
    if (!tableType) {
      throw new NotFoundException('Table type not found');
    }

    // Generate table numbers
    const tableNumbers: string[] = [];
    for (let i = 0; i < dto.quantity; i++) {
      const num = dto.startNumber + i;
      const formattedNum = num < 10 ? `0${num}` : `${num}`;
      tableNumbers.push(`${dto.prefix}${formattedNum}`);
    }

    // Check duplicate table numbers in the same branch
    const existingTables = await this.prisma.restaurantTable.findMany({
      where: {
        branchId: dto.branchId,
        tableNumber: {
          in: tableNumbers,
        },
      },
    });

    if (existingTables.length > 0) {
      const duplicateNames = existingTables.map(t => t.tableNumber).join(', ');
      throw new ConflictException(`Các bàn sau đã tồn tại trong chi nhánh này: ${duplicateNames}`);
    }

    const tablesData = tableNumbers.map(tableNumber => ({
      tableNumber,
      floor: dto.floor,
      status: dto.status ?? RestaurantTableStatus.AVAILABLE,
      note: dto.note,
      branchId: dto.branchId,
      tableTypeId: dto.tableTypeId,
    }));

    const result = await this.prisma.restaurantTable.createMany({
      data: tablesData,
    });

    return {
      message: 'Tạo hàng loạt bàn thành công',
      count: result.count,
    };
  }

  async getRestaurantTables() {
    return this.prisma.restaurantTable.findMany({
      include: {
        branch: true,
        tableType: true,
      },
    });
  }

  async getRestaurantTableById(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id },
      include: {
        branch: true,
        tableType: true,
      },
    });
    if (!table) {
      throw new NotFoundException('Restaurant table not found');
    }
    return table;
  }

  async getRestaurantTablesByBranch(branchId: string) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return this.prisma.restaurantTable.findMany({
      where: { branchId },
      include: {
        tableType: true,
        branch: true,
      },
      orderBy: [
        { floor: 'asc' },
        { tableNumber: 'asc' },
      ],
    });
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

    // Check duplicate if changing branchId or tableNumber
    const targetBranchId = dto.branchId ?? table.branchId;
    const targetTableNumber = dto.tableNumber ?? table.tableNumber;
    
    if (targetBranchId !== table.branchId || targetTableNumber !== table.tableNumber) {
      const existingTable = await this.prisma.restaurantTable.findFirst({
        where: {
          branchId: targetBranchId,
          tableNumber: targetTableNumber,
          id: { not: id }, // Exclude current table
        },
      });
      if (existingTable) {
        throw new ConflictException(`Table number ${targetTableNumber} already exists in this branch`);
      }
    }

    return this.prisma.restaurantTable.update({
      where: { id },
      data: dto,
    });
  }

  async deleteRestaurantTable(id: string) {
    await this.getRestaurantTableById(id); // validate exists

    // Currently no dependency check needed as per requirements (e.g. Reservation/Order)
    return this.prisma.restaurantTable.delete({
      where: { id },
    });
  }
}
