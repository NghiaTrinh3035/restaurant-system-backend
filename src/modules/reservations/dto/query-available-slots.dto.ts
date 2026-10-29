import { IsString, IsNotEmpty, IsUUID, Matches, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryAvailableSlotsDto {
  @ApiProperty({ description: 'ID chi nhánh cần tra cứu' })
  @IsUUID()
  @IsNotEmpty({ message: 'Vui lòng chọn chi nhánh.' })
  branchId: string;

  @ApiProperty({ description: 'Ngày muốn đặt bàn (YYYY-MM-DD)', example: '2026-10-30' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày phải theo định dạng YYYY-MM-DD.' })
  date: string;

  @ApiPropertyOptional({ description: 'Số lượng khách dự kiến', default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount?: number;

  @ApiPropertyOptional({ description: 'Thời lượng dùng bữa tính theo phút (mặc định theo slot của chi nhánh)', example: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  durationMinutes?: number;
}
