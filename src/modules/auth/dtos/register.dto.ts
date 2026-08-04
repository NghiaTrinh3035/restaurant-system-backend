import { IsString, IsEmail, IsNotEmpty, MinLength } from "class-validator";

export class RegisterDto {
    @IsString()
    @IsNotEmpty()
    fullName: string;

    @IsString()
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @MinLength(6)
    @IsNotEmpty()
    password: string;

    @IsString()
    @MinLength(6)
    @IsNotEmpty()
    confirmPassword: string;
}