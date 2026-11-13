import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DineInService } from '../services/dine-in.service';
import { CreateOrderBatchDto } from '../dtos/create-order-batch.dto';
import { CheckoutInvoiceDto } from '../dtos/checkout-invoice.dto';
import { OpenTableSessionDto } from '../dtos/open-table-session.dto';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { Public } from 'src/core/common/decorators/public.decorator';
import { CurrentUser } from 'src/core/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/common/guards/roles.guard';
import { Roles } from 'src/core/common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';

@ApiTags('Dine-In Table Ordering')
@Controller('dine-in')
export class DineInController {
  constructor(private readonly dineInService: DineInService) {}

  @Get('tables/:tableId/session')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Khách hoặc phục vụ quét QR tại bàn: Lấy thông tin bàn, phiên ăn và thực đơn chi nhánh' })
  @ResponseMessage('Lấy thông tin phiên bàn ăn thành công.')
  async getTableSession(@Param('tableId') tableId: string) {
    return this.dineInService.getTableSession(tableId);
  }

  @Post('tables/:tableId/open')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Mở phiên ăn mới (Invoice) cho bàn ăn' })
  @ResponseMessage('Mở phiên ăn tại bàn thành công.')
  async openTableSession(
    @Param('tableId') tableId: string,
    @Body() dto: OpenTableSessionDto,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.dineInService.openTableSession(tableId, dto, user);
  }

  @Post('tables/:tableId/orders')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Gửi một đợt gọi món mới vào bàn ăn (chuyển thẳng xuống Bếp)' })
  @ResponseMessage('Gửi đợt gọi món vào bàn thành công.')
  async createOrderBatch(
    @Param('tableId') tableId: string,
    @Body() dto: CreateOrderBatchDto,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.dineInService.createOrderBatch(tableId, dto, user);
  }

  @Post('tables/:tableId/request-payment')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Khách tại bàn nhấn nút Yêu cầu thanh toán (báo phục vụ)' })
  @ResponseMessage('Đã gửi yêu cầu thanh toán tới nhân viên phục vụ.')
  async requestPayment(@Param('tableId') tableId: string) {
    return this.dineInService.requestPayment(tableId);
  }

  @Post('invoices/:invoiceId/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STAFF, Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nhân viên/Thu ngân xác nhận thanh toán hóa đơn bàn ăn và giải phóng bàn sang chờ dọn' })
  @ResponseMessage('Thanh toán hóa đơn bàn ăn thành công.')
  async checkoutInvoice(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: CheckoutInvoiceDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.dineInService.checkoutInvoice(invoiceId, dto, user);
  }

  @Get('invoices/:invoiceId')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xem chi tiết hóa đơn bàn ăn' })
  @ResponseMessage('Lấy chi tiết hóa đơn thành công.')
  async getInvoiceById(@Param('invoiceId') invoiceId: string) {
    return this.dineInService.getInvoiceById(invoiceId);
  }
}

