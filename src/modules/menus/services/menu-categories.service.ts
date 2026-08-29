import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMenuCategoryDto } from '../dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from '../dto/update-menu-category.dto';

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

  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    return this.prisma.menuCategory.findMany({
      where,
      orderBy: { order: 'asc' },
    });
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
