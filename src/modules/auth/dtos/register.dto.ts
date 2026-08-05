import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MinLength,
  Length,
  IsNumberString,
} from 'class-validator';

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

  @IsString()
  @IsNumberString()
  @Length(6, 6)
  @IsNotEmpty()
  otp: string;
}