import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty({ description: 'ID món ăn trong thực đơn', example: '11111111-1111-1111-1111-111111111111' })
  @IsUUID('4', { message: 'menuItemId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'menuItemId không được để trống' })
  menuItemId: string;

  @ApiProperty({ description: 'Số lượng món', example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: 'quantity phải là số nguyên' })
  @Min(1, { message: 'quantity tối thiểu là 1' })
  quantity: number;

  @ApiPropertyOptional({ description: 'Ghi chú cho món ăn', example: 'Ít đường, không đá' })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi ký tự' })
  note?: string;
}

export class CreateOrderBatchDto {
  @ApiProperty({ description: 'Danh sách các món ăn trong đợt gọi món', type: [OrderItemDto] })
  @IsArray({ message: 'items phải là mảng danh sách món ăn' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiPropertyOptional({ description: 'Ghi chú chung cho cả đợt gọi món', example: 'Lên món nhanh giúp em' })
  @IsOptional()
  @IsString({ message: 'note phải là chuỗi ký tự' })
  note?: string;

  @ApiPropertyOptional({ description: 'Tên người gọi món (nếu là khách mới)', example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString({ message: 'customerName phải là chuỗi ký tự' })
  customerName?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại khách (nếu có)', example: '0901234567' })
  @IsOptional()
  @IsString({ message: 'customerPhone phải là chuỗi ký tự' })
  customerPhone?: string;
}

