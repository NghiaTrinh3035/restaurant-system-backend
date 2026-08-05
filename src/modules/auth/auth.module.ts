import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { PasswordService } from 'src/core/security/password/password.service';
import { AuthJwtService } from 'src/core/security/jwt/auth-jwt.service';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    MailModule,
    // RedisModule không cần import vì đã là @Global()
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService, PasswordService, AuthJwtService],
  exports: [AuthService, AuthJwtService],
})
export class AuthModule {}
