import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PickupOrderStatus } from '@prisma/client';

export class UpdatePickupOrderStatusDto {
  @ApiProperty({
    enum: PickupOrderStatus,
    description: 'Trạng thái mới của đơn mang về',
    example: PickupOrderStatus.CONFIRMED,
  })
  @IsEnum(PickupOrderStatus)
  status: PickupOrderStatus;

  @ApiPropertyOptional({
    description: 'Lý do hủy đơn nếu chuyển sang CANCELLED',
    example: 'Hết nguyên liệu món chính',
  })
  @IsOptional()
  @IsString()
  cancelledReason?: string;
}
