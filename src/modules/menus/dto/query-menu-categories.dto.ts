import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

export class QueryMenuCategoriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Bao gồm các danh mục đã ẩn (true/false)' })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  @IsOptional()
  includeInactive?: boolean;
}
