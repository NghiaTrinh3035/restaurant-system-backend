import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '@prisma/client';
import { MAX_RESERVATION_TABLES } from '../helpers/reservation.helper';

export class UpdateReservationStatusDto {
  @ApiProperty({
    enum: ReservationStatus,
    description: 'Trạng thái mới của đơn đặt bàn',
    example: ReservationStatus.SEATED,
  })
  @IsEnum(ReservationStatus)
  status: ReservationStatus;

  @ApiPropertyOptional({
    description: 'Ghi chú hoặc lý do thay đổi trạng thái',
    example: 'Khách đã đến quầy và nhận bàn',
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: 'ID bàn được xếp cho đơn đặt bàn',
    example: 'd1983c07-bca2-488b-a80d-8386cfdfcfeb',
  })
  @IsOptional()
  @IsUUID('4', { message: 'ID bàn phải là định dạng UUID hợp lệ.' })
  tableId?: string;

  @ApiPropertyOptional({
    description: `Danh sách ID nhiều bàn được xếp cho đơn (tối đa ${MAX_RESERVATION_TABLES} bàn)`,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RESERVATION_TABLES, {
    message: `Chỉ được gán tối đa ${MAX_RESERVATION_TABLES} bàn cho một đơn đặt bàn.`,
  })
  @IsUUID('4', { each: true, message: 'Mỗi ID bàn phải là định dạng UUID hợp lệ.' })
  tableIds?: string[];
}
