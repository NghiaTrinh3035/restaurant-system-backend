import { IsOptional, IsString, IsEnum, IsUUID, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RestaurantTableStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

export class QueryRestaurantTableDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm kiếm theo số bàn hoặc ghi chú' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID chi nhánh' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID loại bàn' })
  @IsUUID()
  @IsOptional()
  tableTypeId?: string;

  @ApiPropertyOptional({ 
    enum: RestaurantTableStatus, 
    description: 'Lọc theo trạng thái bàn (AVAILABLE, OCCUPIED, DIRTY, MAINTENANCE)' 
  })
  @IsEnum(RestaurantTableStatus)
  @IsOptional()
  status?: RestaurantTableStatus;

  @ApiPropertyOptional({ description: 'Lọc theo tầng' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  floor?: number;
}
