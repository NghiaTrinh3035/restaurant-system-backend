import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response, CookieOptions } from 'express';
import ms, { type StringValue } from 'ms';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { RequestRegisterOtpDto } from '../dtos/request-register-otp.dto';
import { ResendOtpDto } from '../dtos/resend-otp.dto';
import { ForgotPasswordDto } from '../dtos/forgot-password.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { Public } from 'src/core/common/decorators/public.decorator';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Public()
  @ResponseMessage('OTP đã được gửi thành công')
  @Post('register/request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() body: RequestRegisterOtpDto) {
    return this.authService.requestOtp(body);
  }

  @Public()
  @ResponseMessage('Đăng ký thành công')
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Public()
  @ResponseMessage('Đăng nhập thành công')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(body);
    const isProduction = process.env.NODE_ENV !== 'development';

    // Định nghĩa chuẩn type CookieOptions của express
    const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    };

    const accessTime = process.env.JWT_ACCESS_EXPIRES_IN || '1d';
    const refreshTime = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

    res.cookie('accessToken', result.accessToken, {
      ...cookieOptions,
      maxAge: ms(accessTime as StringValue),
    });

    res.cookie('refreshToken', result.refreshToken, {
      ...cookieOptions,
      maxAge: ms(refreshTime as StringValue),
    });

    return result;
  }

  @Public()
  @ResponseMessage('Yêu cầu đặt lại mật khẩu thành công')
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Public()
  @ResponseMessage('Đặt lại mật khẩu thành công')
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  @Public()
  @ResponseMessage('OTP mới đã được gửi thành công')
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() body: ResendOtpDto) {
    return this.authService.resendOtp(body);
  }

  @ResponseMessage('Đăng xuất thành công')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    const isProduction = process.env.NODE_ENV !== 'development';

    const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    };

    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    return null;
  }
}
