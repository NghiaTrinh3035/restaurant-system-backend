import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { KitchenItemStatus } from '@prisma/client';

export class QueryKitchenQueueDto {
  @ApiPropertyOptional({ description: 'ID chi nhánh (nếu Admin xem)', example: '11111111-1111-1111-1111-111111111111' })
  @IsOptional()
  @IsUUID('4', { message: 'branchId phải là định dạng UUID hợp lệ' })
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Nguồn đơn cần lọc (DINE_IN: Tại bàn, PICKUP: Mang về, ALL: Tất cả)',
    enum: ['DINE_IN', 'PICKUP', 'ALL'],
  })
  @IsOptional()
  @IsEnum(['DINE_IN', 'PICKUP', 'ALL'], { message: 'source phải là DINE_IN, PICKUP hoặc ALL' })
  source?: 'DINE_IN' | 'PICKUP' | 'ALL';

  @ApiPropertyOptional({
    description: 'Trạng thái món cần lọc',
    enum: [...Object.values(KitchenItemStatus), 'ALL'],
  })
  @IsOptional()
  @IsEnum([...Object.values(KitchenItemStatus), 'ALL'], { message: 'status không hợp lệ' })
  status?: KitchenItemStatus | 'ALL';
}