import { IsNumber, IsOptional, IsString } from "class-validator";

export class CreateTableTypeDto {
    @IsString()
    name: string;

    @IsNumber()
    capacity: number;

    @IsOptional()
    @IsString()
    description?: string;
}