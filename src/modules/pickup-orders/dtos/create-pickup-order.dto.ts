import {
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PickupOrderItemDto {
  @ApiProperty({ description: 'ID món ăn trong thực đơn', example: 'd3b07384-d113-44f2-9523-228cfb045167' })
  @IsUUID('4')
  @IsNotEmpty()
  menuItemId: string;

  @ApiProperty({ description: 'Số lượng món', example: 2, minimum: 1, maximum: 99 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;

  @ApiPropertyOptional({ description: 'Ghi chú cho từng món', example: 'Ít đường, không đá' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreatePickupOrderDto {
  @ApiProperty({ description: 'ID chi nhánh nhận món', example: 'b0a7c4f1-9304-4bcf-90f7-5421d604b32a' })
  @IsUUID('4')
  @IsNotEmpty()
  branchId: string;

  @ApiProperty({ description: 'Ngày hẹn ghé lấy (YYYY-MM-DD)', example: '2026-10-31' })
  @IsDateString()
  @IsNotEmpty()
  pickupDate: string;

  @ApiProperty({ description: 'Khung giờ hẹn ghé lấy (HH:mm)', example: '18:30' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Khung giờ phải theo định dạng HH:mm (VD: 18:30)' })
  @IsNotEmpty()
  pickupTime: string;

  @ApiProperty({ description: 'Họ và tên người nhận', example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ description: 'Số điện thoại người nhận', example: '0912345678' })
  @Matches(/^(0|\+84)[0-9]{9,10}$/, { message: 'Số điện thoại không hợp lệ' })
  @IsNotEmpty()
  customerPhone: string;

  @ApiPropertyOptional({ description: 'Email người nhận', example: 'khachhang@example.com' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Ghi chú cho đơn hàng mang về', example: 'Đóng gói kỹ mang đi xa' })
  @IsOptional()
  @IsString()
  specialNotes?: string;

  @ApiProperty({ description: 'Danh sách món ăn đặt trước', type: [PickupOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PickupOrderItemDto)
  @ArrayMinSize(1, { message: 'Đơn hàng mang về phải có ít nhất 1 món ăn' })
  items: PickupOrderItemDto[];
}
