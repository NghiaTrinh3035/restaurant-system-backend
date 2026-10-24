import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRestaurantBranchDto } from '../dto/create-restaurant-branch.dto';
import { UpdateRestaurantBranchDto } from '../dto/update-restaurant-branch.dto';
import { QueryRestaurantBranchDto } from '../dto/query-restaurant-branch.dto';
import { UpdateBranchOperatingHoursDto } from '../dto/branch-operating-hours.dto';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import { RestaurantBranch, RestaurantBranchStatus, Prisma, Role } from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { enrichBranchWithStatus } from '../helpers/branch-calculator.helper';

@Injectable()
export class RestaurantBranchService {
  constructor(private readonly prismaService: PrismaService) {}

  private validateTimeRange(open: string, close: string, label: string) {
    if (open >= close) {
      throw new BadRequestException(`${label}: Giờ mở cửa (${open}) phải trước giờ đóng cửa (${close}).`);
    }
  }

  async getRestaurantBranch(id: string) {
    const restaurantBranch = await this.prismaService.restaurantBranch.findUnique({
      where: { id },
      include: {
        province: true,
        ward: true,
        operatingHours: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });

    if (!restaurantBranch) {
      throw new NotFoundException('Restaurant branch not found');
    }

    return enrichBranchWithStatus(restaurantBranch);
  }

  async getRestaurantBranches(query?: QueryRestaurantBranchDto) {
    const where: Prisma.RestaurantBranchWhereInput = {};

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.provinceCode) {
      where.provinceCode = query.provinceCode;
    }

    if (query?.wardCode) {
      where.wardCode = query.wardCode;
    }

    if (query?.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { streetAddress: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const hasDynamicFilterOrSort =
      query?.isOpenNow !== undefined ||
      (query?.lat !== undefined && query?.lng !== undefined);

    if (hasDynamicFilterOrSort) {
      const allBranches = await this.prismaService.restaurantBranch.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          province: true,
          ward: true,
          operatingHours: {
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      });

      let enriched = allBranches.map((b) =>
        enrichBranchWithStatus(b, query?.lat, query?.lng),
      );

      if (query?.isOpenNow !== undefined) {
        enriched = enriched.filter((b) => b.isOpenNow === query.isOpenNow);
      }

      if (query?.lat !== undefined && query?.lng !== undefined) {
        enriched.sort((a, b) => (a.distanceKm ?? 999999) - (b.distanceKm ?? 999999));
      }

      if (!query?.page && !query?.limit) {
        return enriched;
      }

      const page = query?.page || 1;
      const limit = query?.limit || 10;
      const totalItems = enriched.length;
      const items = enriched.slice((page - 1) * limit, page * limit);

      return {
        items,
        meta: new PaginationMetaDto(page, limit, totalItems),
      };
    }

    if (
      !query ||
      (!query.page &&
        !query.limit &&
        !query.search &&
        !query.status &&
        !query.provinceCode &&
        !query.wardCode)
    ) {
      const branches = await this.prismaService.restaurantBranch.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          province: true,
          ward: true,
          operatingHours: {
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      });
      return branches.map((b) => enrichBranchWithStatus(b));
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      this.prismaService.restaurantBranch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          province: true,
          ward: true,
          operatingHours: {
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      }),
      this.prismaService.restaurantBranch.count({ where }),
    ]);

    return {
      items: items.map((b) => enrichBranchWithStatus(b)),
      meta: new PaginationMetaDto(page, limit, totalItems),
    };
  }

  async createRestaurantBranch(dto: CreateRestaurantBranchDto): Promise<RestaurantBranch> {
    const { address, ...rest } = dto;
    return this.prismaService.restaurantBranch.create({
      data: {
        ...rest,
        provinceCode: address.provinceCode,
        wardCode: address.wardCode,
        streetAddress: address.detail,
      },
    });
  }

  async updateRestaurantBranch(
    id: string,
    dto: UpdateRestaurantBranchDto,
  ): Promise<RestaurantBranch> {
    await this.getRestaurantBranch(id);

    const { address, ...rest } = dto;
    const dataToUpdate: Prisma.RestaurantBranchUpdateInput = { ...rest };
    if (address) {
      dataToUpdate.province = { connect: { code: address.provinceCode } };
      dataToUpdate.ward = { connect: { code: address.wardCode } };
      dataToUpdate.streetAddress = address.detail;
    }

    return this.prismaService.restaurantBranch.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  async deleteRestaurantBranch(id: string): Promise<RestaurantBranch> {
    await this.getRestaurantBranch(id);

    return this.prismaService.restaurantBranch.update({
      where: { id },
      data: {
        status: RestaurantBranchStatus.INACTIVE,
      },
    });
  }

  async getProvinces() {
    return this.prismaService.province.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async getWardsByProvince(provinceCode: string) {
    return this.prismaService.ward.findMany({
      where: { provinceCode },
      orderBy: { name: 'asc' },
    });
  }

  async validateBranchAccess(branchId: string, user?: ICurrentUser) {
    const branch = await this.prismaService.restaurantBranch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Không tìm thấy chi nhánh.');
    }

    if (user && user.role === Role.STAFF) {
      const staffBranchId =
        user.branchId !== undefined
          ? user.branchId
          : (
              await this.prismaService.user.findUnique({
                where: { id: user.id },
                select: { branchId: true },
              })
            )?.branchId;

      if (!staffBranchId || staffBranchId !== branchId) {
        throw new ForbiddenException('Bạn không có quyền quản lý thông tin của chi nhánh này.');
      }
    }

    return branch;
  }

  async getOperatingHours(branchId: string, user?: ICurrentUser) {
    const branch = await this.validateBranchAccess(branchId, user);

    const fullBranch = await this.prismaService.restaurantBranch.findUnique({
      where: { id: branchId },
      include: {
        operatingHours: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });

    let hours = fullBranch?.operatingHours || [];
    if (hours.length < 7) {
      const existingDays = new Set(hours.map((h) => h.dayOfWeek));
      const toCreate: Prisma.BranchOperatingHoursCreateManyInput[] = [];

      for (let day = 0; day <= 6; day++) {
        if (!existingDays.has(day)) {
          toCreate.push({
            branchId,
            dayOfWeek: day,
            openTime: branch.openingTime || '08:00',
            closeTime: branch.closingTime || '22:00',
            isOpen: true,
          });
        }
      }

      if (toCreate.length > 0) {
        await this.prismaService.branchOperatingHours.createMany({
          data: toCreate,
          skipDuplicates: true,
        });

        hours = await this.prismaService.branchOperatingHours.findMany({
          where: { branchId },
          orderBy: { dayOfWeek: 'asc' },
        });
      }
    }

    return {
      branchId: branch.id,
      branchName: branch.name,
      openingTime: branch.openingTime,
      closingTime: branch.closingTime,
      slotDurationMinutes: branch.slotDurationMinutes,
      dailyHours: hours,
    };
  }

  async updateOperatingHours(
    branchId: string,
    dto: UpdateBranchOperatingHoursDto,
    user: ICurrentUser,
  ) {
    await this.validateBranchAccess(branchId, user);

    if (dto.openingTime && dto.closingTime) {
      this.validateTimeRange(dto.openingTime, dto.closingTime, 'Khung giờ mặc định');
    }

    if (dto.dailyHours && Array.isArray(dto.dailyHours)) {
      for (const day of dto.dailyHours) {
        if (day.isOpen && day.openTime && day.closeTime) {
          this.validateTimeRange(day.openTime, day.closeTime, `Thứ/Ngày ${day.dayOfWeek}`);
        }
      }
    }

    const updateData: Prisma.RestaurantBranchUpdateInput = {};
    if (dto.openingTime !== undefined) updateData.openingTime = dto.openingTime;
    if (dto.closingTime !== undefined) updateData.closingTime = dto.closingTime;
    if (dto.slotDurationMinutes !== undefined) updateData.slotDurationMinutes = dto.slotDurationMinutes;

    await this.prismaService.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.restaurantBranch.update({
          where: { id: branchId },
          data: updateData,
        });
      }

      if (dto.dailyHours && Array.isArray(dto.dailyHours)) {
        for (const day of dto.dailyHours) {
          await tx.branchOperatingHours.upsert({
            where: {
              branchId_dayOfWeek: {
                branchId,
                dayOfWeek: day.dayOfWeek,
              },
            },
            create: {
              branchId,
              dayOfWeek: day.dayOfWeek,
              openTime: day.openTime,
              closeTime: day.closeTime,
              isOpen: day.isOpen,
            },
            update: {
              openTime: day.openTime,
              closeTime: day.closeTime,
              isOpen: day.isOpen,
            },
          });
        }
      }
    });

    return this.getOperatingHours(branchId);
  }

  async getBranchCapacity(branchId: string, user?: ICurrentUser) {
    const branch = await this.validateBranchAccess(branchId, user);

    const tables = await this.prismaService.restaurantTable.findMany({
      where: {
        branchId,
        isActive: true,
      },
      include: {
        tableType: true,
      },
      orderBy: [
        { floor: 'asc' },
        { tableNumber: 'asc' },
      ],
    });

    const totalTables = tables.length;
    let totalSeats = 0;

    const typeMap = new Map<
      string,
      { id: string; name: string; capacity: number; tableCount: number; totalSeats: number }
    >();

    for (const t of tables) {
      if (!t.tableType) continue;
      const cap = t.tableType.capacity;
      totalSeats += cap;

      let existing = typeMap.get(t.tableTypeId);
      if (!existing) {
        existing = {
          id: t.tableTypeId,
          name: t.tableType.name,
          capacity: cap,
          tableCount: 0,
          totalSeats: 0,
        };
        typeMap.set(t.tableTypeId, existing);
      }
      existing.tableCount += 1;
      existing.totalSeats += cap;
    }

    const byTableType = Array.from(typeMap.values()).sort((a, b) => a.capacity - b.capacity);

    return {
      branchId: branch.id,
      branchName: branch.name,
      openingTime: branch.openingTime,
      closingTime: branch.closingTime,
      slotDurationMinutes: branch.slotDurationMinutes,
      totalTables,
      totalSeats,
      byTableType,
    };
  }
}
