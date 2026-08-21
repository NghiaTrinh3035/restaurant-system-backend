import { IsEnum, IsNumber, IsString } from "class-validator";
import { RestaurantBranchStatus } from '@prisma/client';


export class CreateRestaurantBranchDto {
    @IsString()
    name: string;

    @IsString()
    address: string;

    @IsString()
    phone: string;

    @IsNumber()
    latitude: number;

    @IsNumber()
    longitude: number;

    @IsEnum(RestaurantBranchStatus)
    status?: RestaurantBranchStatus;
}