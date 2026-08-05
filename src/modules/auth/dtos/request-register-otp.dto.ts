import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RequestRegisterOtpDto {
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
