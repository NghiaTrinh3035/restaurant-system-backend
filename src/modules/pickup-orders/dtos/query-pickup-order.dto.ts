import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from 'src/core/dto/pagination-query.dto';
import { PickupOrderStatus } from '@prisma/client';

export class QueryPickupOrderDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID chi nhánh' })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({ enum: PickupOrderStatus, description: 'Lọc theo trạng thái đơn hàng' })
  @IsOptional()
  @IsEnum(PickupOrderStatus)
  status?: PickupOrderStatus;

  @ApiPropertyOptional({ description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo mã đơn, tên hoặc số điện thoại' })
  @IsOptional()
  @IsString()
  search?: string;
}
