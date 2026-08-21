import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { RestaurantTableStatus } from '@prisma/client';

export class BulkCreateRestaurantTableDto {
  @IsString()
  prefix: string;

  @IsNumber()
  @Min(1)
  startNumber: number;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  floor: number;

  @IsOptional()
  @IsEnum(RestaurantTableStatus)
  status?: RestaurantTableStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsUUID()
  branchId: string;

  @IsUUID()
  tableTypeId: string;
}
