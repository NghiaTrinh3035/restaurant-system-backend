import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BulkCleanTablesDto {
  @ApiPropertyOptional({
    description:
      'Danh sách ID bàn cần dọn sạch. Nếu để trống, sẽ dọn tất cả bàn đang ở trạng thái DIRTY của chi nhánh',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tableIds?: string[];

  @ApiPropertyOptional({
    description: 'Ghi chú sau khi dọn dẹp',
    example: 'Đã dọn sạch và sẵn sàng phục vụ',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
