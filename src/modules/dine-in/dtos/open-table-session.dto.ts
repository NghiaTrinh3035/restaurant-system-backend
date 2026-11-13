import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class OpenTableSessionDto {
  @ApiPropertyOptional({ description: 'Tên khách hàng ngồi bàn', example: 'Anh Tuấn' })
  @IsOptional()
  @IsString({ message: 'customerName phải là chuỗi ký tự' })
  customerName?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại liên hệ', example: '0912345678' })
  @IsOptional()
  @IsString({ message: 'customerPhone phải là chuỗi ký tự' })
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Số lượng khách ngồi bàn', example: 4, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'guestCount phải là số nguyên' })
  @Min(1, { message: 'guestCount tối thiểu là 1' })
  guestCount?: number;

  @ApiPropertyOptional({ description: 'ID đơn đặt bàn trước (nếu có)', example: '11111111-1111-1111-1111-111111111111' })
  @IsOptional()
  @IsUUID('4', { message: 'reservationId phải là định dạng UUID hợp lệ' })
  reservationId?: string;

  @ApiPropertyOptional({ description: 'Ghi chú ban đầu', example: 'Khách muốn ngồi gần cửa sổ' })
  @IsOptional()
  @IsString({ message: 'notes phải là chuỗi ký tự' })
  notes?: string;
}
