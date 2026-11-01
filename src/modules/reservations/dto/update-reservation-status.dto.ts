import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '@prisma/client';

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
}
