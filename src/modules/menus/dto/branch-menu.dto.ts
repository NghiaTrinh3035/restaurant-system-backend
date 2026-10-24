import {
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsNumber,
  Min,
  IsArray,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === 'true' || value === true;
};

export class QueryBranchMenuDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID danh mục món ăn' })
  @IsUUID('all')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên món ăn hoặc mô tả' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái còn hàng trong ngày' })
  @Transform(toOptionalBoolean)
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái kinh doanh tại chi nhánh' })
  @Transform(toOptionalBoolean)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateBranchMenuAvailabilityDto {
  @ApiProperty({ description: 'Trạng thái còn hàng trong ngày tại chi nhánh' })
  @IsBoolean()
  isAvailable: boolean;
}

export class UpdateBranchMenuStatusDto {
  @ApiProperty({ description: 'Trạng thái kinh doanh món tại chi nhánh' })
  @IsBoolean()
  isActive: boolean;
}

export class UpdateBranchMenuPriceDto {
  @ApiPropertyOptional({
    description: 'Giá riêng cho chi nhánh (null để dùng giá gốc chuỗi)',
    example: 125000,
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === undefined || value === '' ? null : Number(value),
  )
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  priceOverride?: number | null;
}

export class BulkUpdateBranchMenuDto {
  @ApiProperty({ description: 'Danh sách ID món ăn cần cập nhật', type: [String] })
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
