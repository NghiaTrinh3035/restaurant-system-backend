import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TablesService } from '../services/tables.service';
import { CreateTableTypeDto } from '../dto/table-type.dto';
import { CreateRestaurantTableDto } from '../dto/restaurant-table.dto';
import { UpdateTableTypeDto } from '../dto/update-table-type.dto';
import { UpdateRestaurantTableDto } from '../dto/update-restaurant-table.dto';
import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/common/guards/roles.guard';
import { Roles } from 'src/core/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  // ==========================================
  // TABLE TYPE
  // ==========================================

  @Post('types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ResponseMessage('Tạo loại bàn thành công')
  createTableType(@Body() dto: CreateTableTypeDto) {
    return this.tablesService.createTableType(dto);
  }

  @Get('types')
  @ResponseMessage('Lấy danh sách loại bàn thành công')
  getTableTypes() {
    return this.tablesService.getTableTypes();
  }

  @Get('types/:id')
  @ResponseMessage('Lấy chi tiết loại bàn thành công')
  getTableTypeById(@Param('id') id: string) {
    return this.tablesService.getTableTypeById(id);
  }

  @Patch('types/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ResponseMessage('Cập nhật loại bàn thành công')
  updateTableType(@Param('id') id: string, @Body() dto: UpdateTableTypeDto) {
    return this.tablesService.updateTableType(id, dto);
  }

  @Delete('types/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ResponseMessage('Xóa loại bàn thành công')
  deleteTableType(@Param('id') id: string) {
    return this.tablesService.deleteTableType(id);
  }

  // ==========================================
  // RESTAURANT TABLE
  // ==========================================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ResponseMessage('Tạo bàn thành công')
  createRestaurantTable(@Body() dto: CreateRestaurantTableDto) {
    return this.tablesService.createRestaurantTable(dto);
  }

  @Get()
  @ResponseMessage('Lấy danh sách bàn thành công')
  getRestaurantTables() {
    return this.tablesService.getRestaurantTables();
  }

  @Get('branch/:branchId')
  @ResponseMessage('Lấy danh sách bàn theo chi nhánh thành công')
  getRestaurantTablesByBranch(@Param('branchId') branchId: string) {
    return this.tablesService.getRestaurantTablesByBranch(branchId);
  }

  @Get(':id')
  @ResponseMessage('Lấy chi tiết bàn thành công')
  getRestaurantTableById(@Param('id') id: string) {
    return this.tablesService.getRestaurantTableById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ResponseMessage('Cập nhật bàn thành công')
  updateRestaurantTable(@Param('id') id: string, @Body() dto: UpdateRestaurantTableDto) {
    return this.tablesService.updateRestaurantTable(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ResponseMessage('Xóa bàn thành công')
  deleteRestaurantTable(@Param('id') id: string) {
    return this.tablesService.deleteRestaurantTable(id);
  }
}
