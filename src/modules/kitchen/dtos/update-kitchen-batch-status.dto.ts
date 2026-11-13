import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { KitchenItemStatus } from '@prisma/client';

export class UpdateKitchenBatchStatusDto {
  @ApiProperty({
    description: 'Trạng thái áp dụng cho toàn bộ món trong đợt',
    enum: KitchenItemStatus,
    example: KitchenItemStatus.PREPARING,
  })
  @IsEnum(KitchenItemStatus, { message: 'status phải là một trong các giá trị của KitchenItemStatus' })
  @IsNotEmpty({ message: 'status không được để trống' })
  status: KitchenItemStatus;
}
