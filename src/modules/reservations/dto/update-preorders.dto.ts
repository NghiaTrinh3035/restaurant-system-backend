import { IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PreOrderItemDto } from './create-reservation.dto';

export class UpdatePreOrdersDto {
  @ApiProperty({ description: 'Danh sách món ăn đặt trước', type: [PreOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreOrderItemDto)
  items: PreOrderItemDto[];
}
