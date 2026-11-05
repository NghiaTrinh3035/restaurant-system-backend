import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PickupOrdersService } from '../services/pickup-orders.service';
import { CreatePickupOrderDto } from '../dtos/create-pickup-order.dto';
import { QueryPickupOrderDto } from '../dtos/query-pickup-order.dto';
import { UpdatePickupOrderStatusDto } from '../dtos/update-pickup-order-status.dto';
import { PaginationQueryDto } from 'src/core/dto/pagination-query.dto';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { Public } from 'src/core/common/decorators/public.decorator';
import { CurrentUser } from 'src/core/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/common/guards/roles.guard';
import { Roles } from 'src/core/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';

@ApiTags('Pickup Orders (Takeaway)')
@Controller('pickup-orders')
export class PickupOrdersController {
  constructor(private readonly pickupOrdersService: PickupOrdersService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Khách hàng đặt trước món ăn hẹn giờ đến lấy mang về' })
  @ResponseMessage('Đặt món mang về thành công.')
  async createPickupOrder(
    @Body() dto: CreatePickupOrderDto,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.pickupOrdersService.createPickupOrder(dto, user);
  }

  @Get('my-history')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Khách hàng xem lịch sử các đơn món mang về của mình' })
  @ResponseMessage('Lấy lịch sử đơn mang về thành công.')
  async getMyPickupOrders(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.pickupOrdersService.getMyPickupOrders(user, query);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nhân viên / Quản trị viên xem danh sách đơn mang về của chi nhánh' })
  @ResponseMessage('Lấy danh sách đơn mang về thành công.')
  async getPickupOrders(
    @Query() query: QueryPickupOrderDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.pickupOrdersService.getPickupOrders(query, user);
  }

  @Get(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xem chi tiết đơn hàng mang về' })
  @ResponseMessage('Lấy chi tiết đơn mang về thành công.')
  async getPickupOrderById(
    @Param('id') id: string,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.pickupOrdersService.getPickupOrderById(id, user);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hủy đơn hàng mang về' })
  @ResponseMessage('Hủy đơn hàng mang về thành công.')
  async cancelPickupOrder(
    @Param('id') id: string,
    @CurrentUser() user: ICurrentUser,
    @Body('reason') reason?: string,
  ) {
    return this.pickupOrdersService.cancelPickupOrder(id, reason, user);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nhân viên cập nhật trạng thái chế biến (CONFIRMED -> PREPARING -> READY -> COMPLETED)' })
  @ResponseMessage('Cập nhật trạng thái đơn mang về thành công.')
  async updatePickupOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePickupOrderStatusDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.pickupOrdersService.updatePickupOrderStatus(id, dto, user);
  }

  @Post('verify-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đối chiếu mã nhận hàng và hoàn tất giao món' })
  @ResponseMessage('Xác minh mã nhận hàng thành công.')
  async verifyPickupCode(
    @Body('orderCode') orderCode: string,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.pickupOrdersService.verifyPickupCode(orderCode, user);
  }
}
