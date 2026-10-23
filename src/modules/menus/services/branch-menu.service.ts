import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  QueryBranchMenuDto,
  UpdateBranchMenuAvailabilityDto,
  UpdateBranchMenuStatusDto,
  UpdateBranchMenuPriceDto,
  BulkUpdateBranchMenuDto,
} from '../dto/branch-menu.dto';
import type { ICurrentUser } from '../../../core/common/interfaces/current-user.interface';
import { ApiResponseDto, PaginationMetaDto } from '../../../core/dto/api-response.dto';
import { Prisma, Role } from '@prisma/client';

@Injectable()
export class BranchMenuService {
  constructor(private readonly prisma: PrismaService) {}

  private async validateBranchAccess(branchId: string, user: ICurrentUser) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Không tìm thấy chi nhánh.');
    }

    if (user.role === Role.STAFF) {
      const staffBranchId =
        user.branchId !== undefined
          ? user.branchId
          : (
              await this.prisma.user.findUnique({
                where: { id: user.id },
                select: { branchId: true },
              })
            )?.branchId;

      if (!staffBranchId || staffBranchId !== branchId) {
        throw new ForbiddenException('Bạn không có quyền quản lý thực đơn của chi nhánh này.');
      }
    }

    return branch;
  }

  private async updateBranchMenuItem(
    branchId: string,
    menuItemId: string,
    data: Prisma.BranchMenuItemUpdateInput,
    user: ICurrentUser,
  ) {
    await this.validateBranchAccess(branchId, user);

    const record = await this.prisma.branchMenuItem.findUnique({
      where: {
        branchId_menuItemId: { branchId, menuItemId },
      },
    });

    if (!record) {
      throw new NotFoundException('Món ăn này chưa được gán vào chi nhánh.');
    }

    return this.prisma.branchMenuItem.update({
      where: {
        branchId_menuItemId: { branchId, menuItemId },
      },
      data,
      include: {
        menuItem: {
          include: { category: true },
        },
      },
    });
  }

  async getBranchMenu(branchId: string, query: QueryBranchMenuDto, user: ICurrentUser) {
    const branch = await this.validateBranchAccess(branchId, user);
    await this.syncBranchMenuInternal(branchId);

    const menuItemWhere: Prisma.MenuItemWhereInput = {
      isActive: true,
    };

    if (query.categoryId) {
      menuItemWhere.categoryId = query.categoryId;
    }

    if (query.search) {
      menuItemWhere.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const where: Prisma.BranchMenuItemWhereInput = {
      branchId,
      menuItem: menuItemWhere,
    };

    if (query.isAvailable !== undefined) {
      where.isAvailable = query.isAvailable;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const [items, totalItems, inStockCount, outOfStockCount, inactiveCount] = await Promise.all([
      this.prisma.branchMenuItem.findMany({
        where,
        skip,
        take: limit,
        include: {
          menuItem: {
            include: {
              category: true,
            },
          },
        },
        orderBy: [
          { menuItem: { category: { order: 'asc' } } },
          { menuItem: { name: 'asc' } },
        ],
      }),
      this.prisma.branchMenuItem.count({ where }),
      this.prisma.branchMenuItem.count({
        where: { branchId, isAvailable: true, isActive: true, menuItem: { isActive: true } },
      }),
      this.prisma.branchMenuItem.count({
        where: { branchId, isAvailable: false, isActive: true, menuItem: { isActive: true } },
      }),
      this.prisma.branchMenuItem.count({
        where: { branchId, isActive: false, menuItem: { isActive: true } },
      }),
    ]);

    const meta = new PaginationMetaDto(page, limit, totalItems);

    return new ApiResponseDto(
      true,
      'Lấy danh sách thực đơn chi nhánh thành công.',
      {
        branch: {
          id: branch.id,
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
        },
        stats: {
          total: inStockCount + outOfStockCount + inactiveCount,
          inStock: inStockCount,
          outOfStock: outOfStockCount,
          inactive: inactiveCount,
        },
        items,
      },
      meta,
    );
  }

  async updateAvailability(
    branchId: string,
    menuItemId: string,
    dto: UpdateBranchMenuAvailabilityDto,
    user: ICurrentUser,
  ) {
    return this.updateBranchMenuItem(branchId, menuItemId, { isAvailable: dto.isAvailable }, user);
  }

  async updateStatus(
    branchId: string,
    menuItemId: string,
    dto: UpdateBranchMenuStatusDto,
    user: ICurrentUser,
  ) {
    return this.updateBranchMenuItem(branchId, menuItemId, { isActive: dto.isActive }, user);
  }

  async updatePriceOverride(
    branchId: string,
    menuItemId: string,
    dto: UpdateBranchMenuPriceDto,
    user: ICurrentUser,
  ) {
    const priceOverride =
      dto.priceOverride !== undefined && dto.priceOverride !== null
        ? new Prisma.Decimal(dto.priceOverride)
        : null;

    return this.updateBranchMenuItem(branchId, menuItemId, { priceOverride }, user);
  }

  async bulkUpdate(
    branchId: string,
    dto: BulkUpdateBranchMenuDto,
    user: ICurrentUser,
  ) {
    await this.validateBranchAccess(branchId, user);

    if (!dto.menuItemIds || dto.menuItemIds.length === 0) {
      throw new BadRequestException('Danh sách món ăn không được để trống.');
    }

    const data: Prisma.BranchMenuItemUpdateManyMutationInput = {};
    if (dto.isAvailable !== undefined) data.isAvailable = dto.isAvailable;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const result = await this.prisma.branchMenuItem.updateMany({
      where: {
        branchId,
        menuItemId: { in: dto.menuItemIds },
      },
      data,
    });

    return {
      updatedCount: result.count,
    };
  }

  private async syncBranchMenuInternal(branchId: string) {
    const activeMenuItems = await this.prisma.menuItem.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    if (activeMenuItems.length === 0) {
      return { syncedCount: 0 };
    }

    const result = await this.prisma.branchMenuItem.createMany({
      data: activeMenuItems.map((item) => ({
        branchId,
        menuItemId: item.id,
        isAvailable: true,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    return { syncedCount: result.count };
  }

  async syncBranchMenu(branchId: string, user?: ICurrentUser) {
    if (user) {
      await this.validateBranchAccess(branchId, user);
    }
    return this.syncBranchMenuInternal(branchId);
  }
}
