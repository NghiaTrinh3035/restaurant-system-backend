import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { EGender } from "../enums/gender.enum";
export class UpdateUserProfileRequest {
    @IsString()
    @IsOptional()
    fullName?: string;

    @IsString()
    @IsOptional()
    phone?: string;

    @IsString()
    @IsOptional()
    avatar?: string;

    @IsEnum(EGender, { message: 'Vui lòng nhập giới tính hợp lệ' })
    @IsOptional()
    gender?: EGender
}