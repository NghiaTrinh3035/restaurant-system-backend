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
import { MenuItemsService } from '../services/menu-items.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { UpdateMenuItemDto } from '../dto/update-menu-item.dto';
import { QueryMenuItemsDto } from '../dto/query-menu-items.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../core/common/decorators/public.decorator';
import { Roles } from '../../../core/common/decorators/roles.decorator';
import { RolesGuard } from '../../../core/common/guards/roles.guard';
import { ResponseMessage } from '../../../core/common/decorators/response-message.decorator';
import { Role } from '@prisma/client';

@ApiTags('Menu Items')
@Controller('menu-items')
export class MenuItemsController {
  constructor(private readonly menuItemsService: MenuItemsService) {}

  // PUBLIC
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy danh sách món ăn (có hỗ trợ filter và search)' })
  @ResponseMessage('Lấy danh sách món ăn thành công.')
  findAll(@Query() query: QueryMenuItemsDto) {
    return this.menuItemsService.findAll(query);
  }

  // PUBLIC
  @Get(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy chi tiết một món ăn' })
  @ResponseMessage('Lấy chi tiết món ăn thành công.')
  findOne(@Param('id') id: string) {
    return this.menuItemsService.findOne(id);
  }

  // ADMIN ONLY
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Thêm món ăn mới (Chỉ Admin)' })
  @ResponseMessage('Thêm món ăn mới thành công.')
  create(@Body() createMenuItemDto: CreateMenuItemDto) {
    return this.menuItemsService.create(createMenuItemDto);
  }

  // ADMIN ONLY
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật món ăn / đổi trạng thái (Chỉ Admin)' })
  @ResponseMessage('Cập nhật món ăn thành công.')
  update(@Param('id') id: string, @Body() updateMenuItemDto: UpdateMenuItemDto) {
    return this.menuItemsService.update(id, updateMenuItemDto);
  }

  // ADMIN ONLY
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ẩn món ăn (Chỉ Admin)' })
  @ResponseMessage('Ẩn món ăn thành công.')
  remove(@Param('id') id: string) {
    return this.menuItemsService.remove(id);
  }
}
