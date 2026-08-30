import { IsEnum, IsNumber, IsString, ValidateNested } from "class-validator";
import { Type } from 'class-transformer';
import { RestaurantBranchStatus } from '@prisma/client';

class CreateRestaurantBranchAddressDto {
    @IsString()
    provinceCode: string;

    @IsString()
    wardCode: string;

    @IsString()
    detail: string;
}

export class CreateRestaurantBranchDto {
    @IsString()
    name: string;

    @ValidateNested()
    @Type(() => CreateRestaurantBranchAddressDto)
    address: CreateRestaurantBranchAddressDto;

    @IsString()
    phone: string;

    @IsNumber()
    latitude: number;

    @IsNumber()
    longitude: number;

    @IsEnum(RestaurantBranchStatus)
    status?: RestaurantBranchStatus;
}