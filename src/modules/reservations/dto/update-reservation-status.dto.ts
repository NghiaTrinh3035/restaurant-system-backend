import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
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

  @ApiPropertyOptional({
    description: 'ID bàn được xếp cho đơn đặt bàn',
    example: 'd1983c07-bca2-488b-a80d-8386cfdfcfeb',
  })
  @IsOptional()
  @IsUUID('4', { message: 'ID bàn phải là định dạng UUID hợp lệ.' })
  tableId?: string;
}
