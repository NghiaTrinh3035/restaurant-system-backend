import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueryAvailableSlotsDto {
  @ApiProperty({ description: 'ID chi nhánh' })
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @ApiProperty({ description: 'Ngày đặt bàn (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiPropertyOptional({ description: 'Số lượng khách' })
  @IsOptional()
  @Type(() => Number)
  guestCount?: number;
}
