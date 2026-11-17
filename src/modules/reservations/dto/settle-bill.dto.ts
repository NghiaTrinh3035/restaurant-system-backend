import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider } from '@prisma/client';

export class SettleBillDto {
  @ApiProperty({
    enum: PaymentProvider,
    description: 'Phương thức thanh toán quyết toán (CASH | MOMO | SEPAY)',
    example: PaymentProvider.CASH,
  })
  @IsEnum(PaymentProvider, { message: 'Phương thức thanh toán phải là CASH, MOMO hoặc SEPAY.' })
  paymentMethod: PaymentProvider;

  @ApiPropertyOptional({
    description: 'Ghi chú quyết toán hóa đơn',
    example: 'Khách thanh toán tiền mặt tại quầy thu ngân',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
