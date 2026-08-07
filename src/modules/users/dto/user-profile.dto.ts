import { IsOptional, IsString } from "class-validator";

export class UpdateUserProfileRequest {
    @IsString()
    fullname: string;

    @IsString()
    phone: string;

    @IsString()
    @IsOptional()
    avatar: string;
}   