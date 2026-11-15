import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentProvider } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser } from 'src/core/common/decorators/current-user.decorator';
import { Public } from 'src/core/common/decorators/public.decorator';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { QueryPaymentDto } from '../dto/query-payment.dto';
import type { MomoCallbackRawPayload } from '../services/momo-gateway.service';
import { PaymentsService } from '../services/payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Khởi tạo link thanh toán trực tuyến (MoMo / VNPay)' })
  @ResponseMessage('Khởi tạo giao dịch thanh toán thành công.')
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @Req() req: Request,
    @CurrentUser() user?: ICurrentUser,
  ) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const rawIp =
      typeof forwardedFor === 'string'
        ? forwardedFor
        : Array.isArray(forwardedFor)
          ? forwardedFor[0]
          : req.ip;

    return this.paymentsService.createPayment(dto, user, rawIp);
  }

  @Post('momo/ipn')
  @Public()
  @ApiOperation({ summary: 'Webhook IPN nhận kết quả thanh toán từ MoMo' })
  async handleMomoIpn(@Body() payload: MomoCallbackRawPayload, @Res() res: Response) {
    const result = await this.paymentsService.handleMomoIpn(payload);
    if (!result.accepted) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: result.reason });
    }
    return res.status(HttpStatus.NO_CONTENT).send();
  }

  @Get('vnpay/ipn')
  @Public()
  @ApiOperation({ summary: 'Webhook IPN nhận kết quả thanh toán từ VNPay' })
  async handleVnpayIpn(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const result = await this.paymentsService.handleVnpayIpn(query);
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('momo/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực chữ ký Return URL khi khách quay về từ MoMo' })
  @ResponseMessage('Xác thực kết quả thanh toán MoMo thành công.')
  async verifyMomoReturn(@Query() query: Record<string, unknown>) {
    return this.paymentsService.verifyReturn(PaymentProvider.MOMO, query);
  }

  @Get('vnpay/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực chữ ký Return URL khi khách quay về từ VNPay' })
  @ResponseMessage('Xác thực kết quả thanh toán VNPay thành công.')
  async verifyVnpayReturn(@Query() query: Record<string, unknown>) {
    return this.paymentsService.verifyReturn(PaymentProvider.VNPAY, query);
  }

  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tra cứu lịch sử giao dịch theo đơn mang về hoặc đơn đặt bàn' })
  @ResponseMessage('Lấy danh sách giao dịch thanh toán thành công.')
  async getPaymentsByTarget(
    @Query() query: QueryPaymentDto,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.paymentsService.getPaymentsByTarget(query, user);
  }

  @Get(':transactionCode')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tra cứu chi tiết và trạng thái giao dịch thanh toán' })
  @ResponseMessage('Lấy thông tin giao dịch thanh toán thành công.')
  async getTransactionByCode(
    @Param('transactionCode') transactionCode: string,
    @CurrentUser() user?: ICurrentUser,
  ) {
    return this.paymentsService.getTransactionByCode(transactionCode, user);
  }
}
