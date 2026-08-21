import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { ConfigModule } from '@nestjs/config';
import { PasswordService } from 'src/core/security/password/password.service';
import { MailModule } from 'src/mail/mail.module';
import { AuthJwtModule } from 'src/core/security/jwt/jwt.module';
import { GoogleStrategy } from 'src/core/security/google/google.strategy';

import { AuthCookieService } from './services/auth-cookie.service';

@Module({
  imports: [
    ConfigModule,
    MailModule,
    AuthJwtModule
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, PasswordService, GoogleStrategy, AuthCookieService],
  exports: [AuthService]
})
export class AuthModule { }
