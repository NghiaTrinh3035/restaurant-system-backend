import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class QueryPaymentDto {
  @ApiPropertyOptional({
    description: 'ID đơn đặt món mang về',
  })
  @IsOptional()
  @IsUUID('4', { message: 'pickupOrderId phải là UUID hợp lệ.' })
  pickupOrderId?: string;

  @ApiPropertyOptional({
    description: 'ID đơn đặt bàn',
  })
  @IsOptional()
  @IsUUID('4', { message: 'reservationId phải là UUID hợp lệ.' })
  reservationId?: string;
}
