import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { UpdateMenuItemDto } from '../dto/update-menu-item.dto';
import { QueryMenuItemsDto } from '../dto/query-menu-items.dto';
import { PaginationMetaDto } from '../../../core/dto/api-response.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MenuItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMenuItemDto) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException('Danh mục món ăn không tồn tại.');
    }

    const item = await this.prisma.menuItem.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: new Prisma.Decimal(dto.price),
        originalPrice: dto.originalPrice !== undefined && dto.originalPrice !== null 
          ? new Prisma.Decimal(dto.originalPrice) 
          : null,
        imageUrl: dto.imageUrl,
        isFeatured: dto.isFeatured ?? false,
        preparationTime: dto.preparationTime,
        isActive: dto.isActive ?? true,
        categoryId: dto.categoryId,
      },
      include: {
        category: true,
      },
    });

    // Tự động gán món mới vào danh sách món của tất cả các chi nhánh hiện có
    const branches = await this.prisma.restaurantBranch.findMany({ select: { id: true } });
    if (branches.length > 0) {
      await this.prisma.branchMenuItem.createMany({
        data: branches.map(b => ({
          branchId: b.id,
          menuItemId: item.id,
          isAvailable: true,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }

    return item;
  }

  async findAll(query: QueryMenuItemsDto) {
    const where: Prisma.MenuItemWhereInput = {};

    if (!query.includeInactive) {
      where.isActive = true;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.isFeatured !== undefined) {
      where.isFeatured = query.isFeatured;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      this.prisma.menuItem.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
        },
        orderBy: [
          { category: { order: 'asc' } },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    const meta = new PaginationMetaDto(page, limit, totalItems);

    return {
      items,
      meta,
    };
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });
    if (!item) {
      throw new NotFoundException('Không tìm thấy món ăn.');
    }
    return item;
  }

  async update(id: string, dto: UpdateMenuItemDto) {
    await this.findOne(id);

    if (dto.categoryId) {
      const category = await this.prisma.menuCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException('Danh mục món ăn không tồn tại.');
      }
    }

    const data: Prisma.MenuItemUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = new Prisma.Decimal(dto.price);
    if (dto.originalPrice !== undefined) {
      data.originalPrice = dto.originalPrice !== null ? new Prisma.Decimal(dto.originalPrice) : null;
    }
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.isFeatured !== undefined) data.isFeatured = dto.isFeatured;
    if (dto.preparationTime !== undefined) data.preparationTime = dto.preparationTime;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.categoryId !== undefined) {
      data.category = { connect: { id: dto.categoryId } };
    }

    return this.prisma.menuItem.update({
      where: { id },
      data,
      include: {
        category: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.menuItem.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
