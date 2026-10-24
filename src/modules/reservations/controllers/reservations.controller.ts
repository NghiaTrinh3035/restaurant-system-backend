import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReservationsService } from '../services/reservations.service';
import { CreateReservationDto } from '../dto/create-reservation.dto';
import { QueryAvailableSlotsDto } from '../dto/query-available-slots.dto';
import { QueryReservationDto } from '../dto/query-reservation.dto';
import { QueryMyReservationsDto } from '../dto/query-my-reservations.dto';
import { UpdatePreOrdersDto } from '../dto/update-preorders.dto';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { Public } from 'src/core/common/decorators/public.decorator';
import { CurrentUser } from 'src/core/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/common/guards/roles.guard';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Đặt bàn trực tuyến thành công.')
  async createReservation(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.reservationsService.createReservation(dto, user);
  }

  @Get('available-slots')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy danh sách khung giờ phục vụ thành công.')
  async getAvailableSlots(@Query() query: QueryAvailableSlotsDto) {
    return this.reservationsService.getAvailableSlots(query);
  }

  @Get('my-history')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy lịch sử đặt bàn của bạn thành công.')
  async getMyReservations(
    @Query() query: QueryMyReservationsDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.reservationsService.getMyReservations(query, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy danh sách đơn đặt bàn thành công.')
  async getReservations(
    @Query() query: QueryReservationDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.reservationsService.getReservations(query, user);
  }

  @Get(':id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy thông tin chi tiết đặt bàn thành công.')
  async getReservationById(
    @Param('id') id: string,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.reservationsService.getReservationById(id, user);
  }

  @Patch(':id/cancel')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Hủy đặt bàn thành công.')
  async cancelReservation(
    @Param('id') id: string,
    @Body('reason') reason?: string,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.reservationsService.cancelReservation(id, reason, user);
  }

  @Get(':id/pre-orders')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy danh sách món ăn đặt trước thành công.')
  async getPreOrders(
    @Param('id') id: string,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.reservationsService.getPreOrders(id, user);
  }

  @Put(':id/pre-orders')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cập nhật món ăn đặt trước thành công.')
  async updatePreOrders(
    @Param('id') id: string,
    @Body() dto: UpdatePreOrdersDto,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.reservationsService.addOrUpdatePreOrders(id, dto.items, user);
  }
}
