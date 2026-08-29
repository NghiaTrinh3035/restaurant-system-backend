import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RestaurantBranchStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

export class QueryRestaurantBranchDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên, địa chỉ, số điện thoại' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ 
    enum: RestaurantBranchStatus, 
    description: 'Lọc theo trạng thái chi nhánh (ACTIVE, CLOSED)' 
  })
  @IsEnum(RestaurantBranchStatus)
  @IsOptional()
  status?: RestaurantBranchStatus;
}
