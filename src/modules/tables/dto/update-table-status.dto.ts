import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RestaurantTableStatus } from '@prisma/client';

export class UpdateTableStatusDto {
  @ApiProperty({
    enum: RestaurantTableStatus,
    description: 'Trạng thái bàn (AVAILABLE, OCCUPIED, MAINTENANCE, DIRTY)',
  })
  @IsEnum(RestaurantTableStatus, { message: 'Trạng thái bàn không hợp lệ.' })
  @IsNotEmpty({ message: 'Trạng thái bàn không được để trống.' })
  status: RestaurantTableStatus;

  @ApiPropertyOptional({ description: 'Ghi chú cho bàn' })
  @IsString()
  @IsOptional()
  note?: string;
}
