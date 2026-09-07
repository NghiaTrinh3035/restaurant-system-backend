import { IsOptional, IsString, IsUUID, IsBoolean, IsNumber, Min, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

export class QueryBranchMenuDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID danh mục món ăn' })
  @IsUUID('all')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên món ăn hoặc mô tả' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái còn hàng / tạm hết trong ngày (true/false)' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái kinh doanh tại chi nhánh (true/false)' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateBranchMenuAvailabilityDto {
  @ApiProperty({ description: 'Trạng thái còn hàng hôm nay tại chi nhánh (true: còn hàng, false: tạm hết)' })
  @IsBoolean()
  isAvailable: boolean;
}

export class UpdateBranchMenuStatusDto {
  @ApiProperty({ description: 'Trạng thái kinh doanh món này tại chi nhánh (true: có bán, false: ngừng bán)' })
  @IsBoolean()
  isActive: boolean;
}

export class UpdateBranchMenuPriceDto {
  @ApiPropertyOptional({ description: 'Giá riêng cho chi nhánh (để null nếu muốn áp dụng giá gốc của chuỗi)', example: 125000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceOverride?: number | null;
}

export class BulkUpdateBranchMenuDto {
  @ApiProperty({ description: 'Danh sách ID các món ăn cần cập nhật', type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  menuItemIds: string[];

  @ApiPropertyOptional({ description: 'Cập nhật trạng thái còn hàng / tạm hết' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Cập nhật trạng thái kinh doanh tại chi nhánh' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
