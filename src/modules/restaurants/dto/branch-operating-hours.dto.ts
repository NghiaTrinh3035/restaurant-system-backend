import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DailyOperatingHourDto {
  @ApiPropertyOptional({ description: 'ID cấu hình ngày nếu có' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'Branch ID nếu có' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ description: 'Ngày trong tuần (0: Chủ Nhật, 1: Thứ Hai, ..., 6: Thứ Bảy)', example: 1 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ description: 'Giờ mở cửa định dạng HH:mm', example: '08:00' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'openTime phải theo định dạng HH:mm (ví dụ: 08:00)',
  })
  openTime: string;

  @ApiProperty({ description: 'Giờ đóng cửa định dạng HH:mm', example: '22:30' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'closeTime phải theo định dạng HH:mm (ví dụ: 22:30)',
  })
  closeTime: string;

  @ApiProperty({ description: 'Trạng thái mở cửa hay nghỉ trong ngày này', example: true })
  @IsBoolean()
  isOpen: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  createdAt?: any;

  @ApiPropertyOptional()
  @IsOptional()
  updatedAt?: any;
}

export class UpdateBranchOperatingHoursDto {
  @ApiPropertyOptional({ description: 'Giờ mở cửa mặc định của cơ sở (HH:mm)', example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'openingTime phải theo định dạng HH:mm',
  })
  openingTime?: string;

  @ApiPropertyOptional({ description: 'Giờ đóng cửa mặc định của cơ sở (HH:mm)', example: '22:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'closingTime phải theo định dạng HH:mm',
  })
  closingTime?: string;

  @ApiPropertyOptional({ description: 'Thời lượng slot dùng bữa tiêu chuẩn tính bằng phút', example: 90 })
  @IsOptional()
  @IsInt()
  @Min(30, { message: 'Thời lượng mỗi slot dùng bữa tối thiểu 30 phút' })
  @Max(240, { message: 'Thời lượng mỗi slot dùng bữa tối đa 240 phút' })
  slotDurationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Danh sách chi tiết giờ mở cửa 7 ngày trong tuần',
    type: [DailyOperatingHourDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyOperatingHourDto)
  dailyHours?: DailyOperatingHourDto[];
}
