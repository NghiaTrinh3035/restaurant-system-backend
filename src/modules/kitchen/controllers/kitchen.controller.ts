import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KitchenService } from '../services/kitchen.service';
import { QueryKitchenQueueDto } from '../dtos/query-kitchen-queue.dto';
import { UpdateKitchenItemStatusDto } from '../dtos/update-kitchen-item-status.dto';
import { UpdateKitchenBatchStatusDto } from '../dtos/update-kitchen-batch-status.dto';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { CurrentUser } from 'src/core/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/common/guards/roles.guard';
import { Roles } from 'src/core/common/decorators/roles.decorator';
import { PickupOrderStatus, Role } from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';

@ApiTags('Kitchen Order Queue Management')
@Controller('kitchen')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.KITCHEN, Role.STAFF, Role.ADMIN)
@ApiBearerAuth()
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get('queue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy danh sách hàng đợi các món ăn bếp chi nhánh (món tại bàn + món mang về)' })
  @ResponseMessage('Lấy hàng đợi bếp thành công.')
  async getKitchenQueue(
    @Query() query: QueryKitchenQueueDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.kitchenService.getKitchenQueue(query, user);
  }

  @Patch('items/:orderItemId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bếp trưởng cập nhật trạng thái của từng món ăn riêng lẻ' })
  @ResponseMessage('Cập nhật trạng thái món ăn thành công.')
  async updateOrderItemStatus(
    @Param('orderItemId') orderItemId: string,
    @Body() dto: UpdateKitchenItemStatusDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.kitchenService.updateOrderItemStatus(orderItemId, dto, user);
  }

  @Patch('batches/:batchId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bếp trưởng cập nhật trạng thái cho toàn bộ món trong một đợt gọi món' })
  @ResponseMessage('Cập nhật trạng thái đợt gọi món thành công.')
  async updateOrderBatchStatus(
    @Param('batchId') batchId: string,
    @Body() dto: UpdateKitchenBatchStatusDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.kitchenService.updateOrderBatchStatus(batchId, dto, user);
  }

  @Patch('pickup-orders/:pickupOrderId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bếp cập nhật trạng thái đơn mang về (PREPARING hoặc READY)' })
  @ResponseMessage('Cập nhật trạng thái đơn mang về thành công.')
  async updatePickupOrderStatus(
    @Param('pickupOrderId') pickupOrderId: string,
    @Body('status') status: PickupOrderStatus,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.kitchenService.updatePickupOrderStatus(pickupOrderId, status, user);
  }
}

