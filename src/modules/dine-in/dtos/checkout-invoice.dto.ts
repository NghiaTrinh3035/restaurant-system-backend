import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckoutInvoiceDto {
  @ApiProperty({ description: 'Phương thức thanh toán', example: 'CASH', enum: ['CASH', 'BANKING', 'VNPAY', 'MOMO', 'CARD'] })
  @IsString({ message: 'paymentMethod phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'paymentMethod không được để trống' })
  paymentMethod: string;

  @ApiPropertyOptional({ description: 'Số tiền giảm giá (VND)', example: 50000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'discountAmount phải là dạng số' })
  @Min(0, { message: 'discountAmount không được là số âm' })
  discountAmount?: number;

  @ApiPropertyOptional({ description: 'Ghi chú thanh toán', example: 'Khách xuất hóa đơn đỏ' })
  @IsOptional()
  @IsString({ message: 'notes phải là chuỗi ký tự' })
  notes?: string;
}

