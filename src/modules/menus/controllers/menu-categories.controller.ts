import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MenuCategoriesService } from '../services/menu-categories.service';
import { CreateMenuCategoryDto } from '../dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from '../dto/update-menu-category.dto';
import { QueryMenuCategoriesDto } from '../dto/query-menu-categories.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../core/common/decorators/public.decorator';
import { Roles } from '../../../core/common/decorators/roles.decorator';
import { RolesGuard } from '../../../core/common/guards/roles.guard';
import { ResponseMessage } from '../../../core/common/decorators/response-message.decorator';
import { Role } from '@prisma/client';

@ApiTags('Menu Categories')
@Controller('menu-categories')
export class MenuCategoriesController {
  constructor(private readonly menuCategoriesService: MenuCategoriesService) {}

  // PUBLIC
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy danh sách danh mục món ăn (hỗ trợ phân trang)' })
  @ResponseMessage('Lấy danh sách danh mục món ăn thành công.')
  findAll(@Query() query: QueryMenuCategoriesDto) {
    return this.menuCategoriesService.findAll(query);
  }

  // PUBLIC
  @Get(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy chi tiết một danh mục món ăn' })
  @ResponseMessage('Lấy chi tiết danh mục món ăn thành công.')
  findOne(@Param('id') id: string) {
    return this.menuCategoriesService.findOne(id);
  }

  // ADMIN ONLY
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo mới danh mục món ăn (Chỉ Admin)' })
  @ResponseMessage('Tạo danh mục món ăn thành công.')
  create(@Body() createMenuCategoryDto: CreateMenuCategoryDto) {
    return this.menuCategoriesService.create(createMenuCategoryDto);
  }

  // ADMIN ONLY
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật danh mục món ăn (Chỉ Admin)' })
  @ResponseMessage('Cập nhật danh mục món ăn thành công.')
  update(@Param('id') id: string, @Body() updateMenuCategoryDto: UpdateMenuCategoryDto) {
    return this.menuCategoriesService.update(id, updateMenuCategoryDto);
  }

  // ADMIN ONLY
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ẩn danh mục món ăn (Chỉ Admin)' })
  @ResponseMessage('Ẩn danh mục món ăn thành công.')
  remove(@Param('id') id: string) {
    return this.menuCategoriesService.remove(id);
  }
}

