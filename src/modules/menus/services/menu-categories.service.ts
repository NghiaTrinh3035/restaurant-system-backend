import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMenuCategoryDto } from '../dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from '../dto/update-menu-category.dto';
import { QueryMenuCategoriesDto } from '../dto/query-menu-categories.dto';
import { PaginationMetaDto } from '../../../core/dto/api-response.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MenuCategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createMenuCategoryDto: CreateMenuCategoryDto) {
    const existing = await this.prisma.menuCategory.findUnique({
      where: { name: createMenuCategoryDto.name },
    });
    if (existing) {
      throw new ConflictException('Tên danh mục đã tồn tại');
    }
    return this.prisma.menuCategory.create({
      data: createMenuCategoryDto,
    });
  }

  async findAll(query?: QueryMenuCategoriesDto) {
    const where: Prisma.MenuCategoryWhereInput = {};
    if (!query?.includeInactive) {
      where.isActive = true;
    }

    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 10;
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { order: 'asc' },
      }),
      this.prisma.menuCategory.count({ where }),
    ]);

    const meta = new PaginationMetaDto(page, limit, totalItems);

    return {
      items,
      meta,
    };
  }

  async findOne(id: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }
    return category;
  }

  async update(id: string, updateMenuCategoryDto: UpdateMenuCategoryDto) {
    await this.findOne(id); // Check existence
    
    if (updateMenuCategoryDto.name) {
      const existing = await this.prisma.menuCategory.findFirst({
        where: {
          name: updateMenuCategoryDto.name,
          NOT: { id },
        },
      });
      if (existing) {
        throw new ConflictException('Tên danh mục đã tồn tại');
      }
    }

    return this.prisma.menuCategory.update({
      where: { id },
      data: updateMenuCategoryDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Check existence
    return this.prisma.menuCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
