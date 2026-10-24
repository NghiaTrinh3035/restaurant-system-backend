import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsEmail,
  IsInt,
  Min,
  Max,
  Matches,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PreOrderItemDto {
  @ApiProperty({ description: 'ID món ăn' })
  @IsUUID()
  @IsNotEmpty()
  menuItemId: string;

  @ApiProperty({ description: 'Số lượng món', default: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Ghi chú cho món' })
  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateReservationDto {
  @ApiProperty({ description: 'ID chi nhánh nhà hàng' })
  @IsUUID()
  @IsNotEmpty({ message: 'Vui lòng chọn chi nhánh.' })
  branchId: string;

  @ApiProperty({ description: 'Họ và tên khách hàng' })
  @IsString()
  @IsNotEmpty({ message: 'Họ tên không được để trống.' })
  customerName: string;

  @ApiProperty({ description: 'Số điện thoại khách hàng' })
  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại không được để trống.' })
  @Matches(/^[0-9+]{9,15}$/, { message: 'Số điện thoại không hợp lệ.' })
  customerPhone: string;

  @ApiPropertyOptional({ description: 'Email khách hàng' })
  @IsEmail({}, { message: 'Email không đúng định dạng.' })
  @IsOptional()
  customerEmail?: string;

  @ApiProperty({ description: 'Số lượng khách', example: 4 })
  @IsInt({ message: 'Số lượng khách phải là số nguyên.' })
  @Min(1, { message: 'Số lượng khách tối thiểu là 1.' })
  @Max(50, { message: 'Số lượng khách vượt quá giới hạn đặt trực tuyến.' })
  guestCount: number;

  @ApiProperty({ description: 'Ngày dùng bữa (YYYY-MM-DD)', example: '2026-10-30' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày đặt bàn phải có định dạng YYYY-MM-DD.' })
  reservationDate: string;

  @ApiProperty({ description: 'Giờ dùng bữa (HH:mm)', example: '18:30' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Giờ đặt bàn phải có định dạng HH:mm.' })
  reservationTime: string;

  @ApiPropertyOptional({ description: 'ID loại bàn mong muốn' })
  @IsUUID()
  @IsOptional()
  tableTypeId?: string;

  @ApiPropertyOptional({ description: 'Yêu cầu hoặc ghi chú đặc biệt' })
  @IsString()
  @IsOptional()
  specialNotes?: string;

  @ApiPropertyOptional({ description: 'Danh sách món ăn gọi trước', type: [PreOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreOrderItemDto)
  @IsOptional()
  preOrders?: PreOrderItemDto[];
}
