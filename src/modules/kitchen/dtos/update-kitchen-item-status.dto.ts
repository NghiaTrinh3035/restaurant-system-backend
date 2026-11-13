import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KitchenItemStatus } from '@prisma/client';

export class UpdateKitchenItemStatusDto {
  @ApiProperty({
    description: 'Trạng thái mới của món ăn',
    enum: KitchenItemStatus,
    example: KitchenItemStatus.PREPARING,
  })
  @IsEnum(KitchenItemStatus, { message: 'status phải là một trong các giá trị của KitchenItemStatus' })
  @IsNotEmpty({ message: 'status không được để trống' })
  status: KitchenItemStatus;

  @ApiPropertyOptional({
    description: 'Lý do hủy món (nếu status = CANCELLED)',
    example: 'Bếp tạm hết nguyên liệu tươi',
  })
  @IsOptional()
  @IsString({ message: 'cancelledReason phải là chuỗi ký tự' })
  cancelledReason?: string;
}
