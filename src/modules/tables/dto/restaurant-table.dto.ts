import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";
import { RestaurantTableStatus } from "@prisma/client";

export class CreateRestaurantTableDto {
    @IsString()
    tableNumber: string;

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