import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

export enum ReservationTimeline {
  UPCOMING = 'UPCOMING',
  PAST = 'PAST',
}

export class QueryMyReservationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ReservationTimeline,
    description: 'Lọc đơn sắp tới (UPCOMING) hoặc lịch sử quá khứ (PAST)',
  })
  @IsEnum(ReservationTimeline)
  @IsOptional()
  timeline?: ReservationTimeline;
}
