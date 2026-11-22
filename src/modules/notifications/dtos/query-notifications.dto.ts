import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/core/dto/pagination-query.dto';

export const NOTIFICATION_CATEGORIES = [
  'RESERVATION',
  'PICKUP',
  'KITCHEN',
  'PAYMENT',
  'SECURITY',
  'ACCOUNT',
  'SYSTEM',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export class QueryNotificationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Chỉ lọc các thông báo chưa đọc (true/false)',
    default: false,
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean({ message: 'unreadOnly phải là kiểu boolean' })
  @IsOptional()
  unreadOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Lọc theo nhóm thông báo',
    enum: NOTIFICATION_CATEGORIES,
  })
  @IsIn(NOTIFICATION_CATEGORIES, { message: 'category không hợp lệ' })
  @IsOptional()
  category?: NotificationCategory;
}
