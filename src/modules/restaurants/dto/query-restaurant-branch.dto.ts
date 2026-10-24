import { IsOptional, IsString, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { RestaurantBranchStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === 'true' || value === true;
};

export class QueryRestaurantBranchDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên, địa chỉ, số điện thoại' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: RestaurantBranchStatus,
    description: 'Lọc theo trạng thái chi nhánh (ACTIVE, INACTIVE)',
  })
  @IsEnum(RestaurantBranchStatus)
  @IsOptional()
  status?: RestaurantBranchStatus;

  @ApiPropertyOptional({ description: 'Lọc theo mã Tỉnh/Thành phố' })
  @IsString()
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'Lọc theo mã Phường/Xã' })
  @IsString()
  @IsOptional()
  wardCode?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ vị trí khách hàng (để tính khoảng cách)', example: 10.762622 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Kinh độ vị trí khách hàng (để tính khoảng cách)', example: 106.660172 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ description: 'Lọc chi nhánh đang mở cửa tại thời điểm hiện tại' })
  @Transform(toOptionalBoolean)
  @IsBoolean()
  @IsOptional()
  isOpenNow?: boolean;
}
