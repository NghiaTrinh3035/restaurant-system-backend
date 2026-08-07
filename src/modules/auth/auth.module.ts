import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { ConfigModule } from '@nestjs/config';
import { PasswordService } from 'src/core/security/password/password.service';
import { MailModule } from 'src/mail/mail.module';
import { AuthJwtModule } from 'src/core/security/jwt/jwt.module';

@Module({
  imports: [
    ConfigModule,
    MailModule,
    AuthJwtModule
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, PasswordService],
  exports: [AuthService]
})
export class AuthModule { }
