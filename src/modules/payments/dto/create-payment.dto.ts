import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider, PaymentPurpose } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Cổng thanh toán sử dụng',
    enum: PaymentProvider,
    example: PaymentProvider.MOMO,
  })
  @IsEnum(PaymentProvider, { message: 'Phương thức thanh toán phải là MOMO.' })
  @IsNotEmpty({ message: 'Vui lòng chọn phương thức thanh toán.' })
  provider: PaymentProvider;

  @ApiProperty({
    description: 'Mục đích thanh toán',
    enum: PaymentPurpose,
    example: PaymentPurpose.PICKUP_ORDER,
  })
  @IsEnum(PaymentPurpose, { message: 'Mục đích thanh toán không hợp lệ.' })
  @IsNotEmpty({ message: 'Vui lòng xác định mục đích thanh toán.' })
  purpose: PaymentPurpose;

  @ApiPropertyOptional({
    description: 'ID đơn đặt bàn (dùng cho RESERVATION_DEPOSIT hoặc RESERVATION_SETTLEMENT)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'reservationId phải là UUID hợp lệ.' })
  reservationId?: string;

  @ApiPropertyOptional({
    description: 'ID đơn đặt món mang về (dùng cho PICKUP_ORDER)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'pickupOrderId phải là UUID hợp lệ.' })
  pickupOrderId?: string;
}
