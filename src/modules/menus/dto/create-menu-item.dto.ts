import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsInt, IsUrl, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateMenuItemDto {
  @ApiProperty({ description: 'Tên món ăn' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết món ăn' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Giá bán (VND)', example: 65000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Giá gốc trước giảm giá (VND)', example: 85000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  originalPrice?: number;

  @ApiPropertyOptional({ description: 'URL ảnh món ăn (Cloudinary)' })
  @IsUrl()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Trạng thái còn phục vụ', default: true })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Món nổi bật / bán chạy', default: false })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'Thời gian chế biến ước tính (phút)', example: 15 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  preparationTime?: number;

  @ApiProperty({ description: 'ID danh mục món ăn (UUID)' })
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({ description: 'Trạng thái hiển thị trong hệ thống', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
