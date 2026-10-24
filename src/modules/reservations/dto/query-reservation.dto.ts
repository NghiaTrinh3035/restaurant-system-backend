import { IsOptional, IsString, IsEnum, IsUUID, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

export class QueryReservationDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã đặt bàn, tên khách, số điện thoại' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID chi nhánh' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ enum: ReservationStatus, description: 'Lọc theo trạng thái đặt bàn' })
  @IsEnum(ReservationStatus)
  @IsOptional()
  status?: ReservationStatus;

  @ApiPropertyOptional({ description: 'Từ ngày (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fromDate phải theo định dạng YYYY-MM-DD.' })
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'toDate phải theo định dạng YYYY-MM-DD.' })
  @IsOptional()
  toDate?: string;
}
