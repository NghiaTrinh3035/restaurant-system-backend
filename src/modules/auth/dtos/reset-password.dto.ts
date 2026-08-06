import { IsEmail, IsNotEmpty, MinLength, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiProperty({ description: 'Mã OTP 6 số' })
    @IsString()
    @IsNotEmpty()
    otp: string;

    @ApiProperty({ minLength: 6 })
    @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
    newPassword: string;
}