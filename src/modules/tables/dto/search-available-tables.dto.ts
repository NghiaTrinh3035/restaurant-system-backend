import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class SearchAvailableTablesDto {
  @ApiProperty({ description: 'ID chi nhánh nhà hàng cần tìm bàn (UUID)' })
  @IsUUID('all', { message: 'branchId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'branchId không được để trống' })
  branchId: string;

  @ApiProperty({ description: 'Số lượng khách (Party size)', example: 4 })
  @Type(() => Number)
  @IsInt({ message: 'partySize phải là số nguyên' })
  @Min(1, { message: 'partySize tối thiểu là 1' })
  partySize: number;

  @ApiPropertyOptional({ description: 'Tầng cụ thể muốn tìm', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'floor phải là số nguyên' })
  @Min(1, { message: 'floor tối thiểu là 1' })
  @IsOptional()
  floor?: number;

  @ApiProperty({ description: 'Ngày dự định đặt bàn (YYYY-MM-DD)', example: '2026-10-25' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date phải có định dạng YYYY-MM-DD' })
  date: string;

  @ApiProperty({ description: 'Giờ dự định đến (HH:mm)', example: '18:30' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time phải có định dạng HH:mm' })
  time: string;

  @ApiPropertyOptional({
    description: 'Bao gồm cả các bàn đang bị khóa tạm thời (mặc định: false - chỉ lấy bàn còn trống hoàn toàn)',
    default: false,
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return false;
    return value === 'true' || value === true;
  })
  @IsBoolean()
  @IsOptional()
  includeLocked?: boolean = false;
}
