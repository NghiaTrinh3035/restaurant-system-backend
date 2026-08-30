import { Body, Controller, HttpCode, HttpStatus, Post, Get, Req, UseGuards, Res } from '@nestjs/common';
import type { Request, Response, CookieOptions } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../services/auth.service';
import { AuthCookieService } from '../services/auth-cookie.service';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { RequestRegisterOtpDto } from '../dtos/request-register-otp.dto';
import { ResendOtpDto } from '../dtos/resend-otp.dto';
import { ForgotPasswordDto } from '../dtos/forgot-password.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { Public } from 'src/core/common/decorators/public.decorator';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { GoogleAuthGuard } from 'src/core/common/guards/google-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) { }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Tối đa 3 lần yêu cầu OTP / 1 phút
  @ResponseMessage('OTP đã được gửi thành công')
  @Post('register/request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() body: RequestRegisterOtpDto) {
    return this.authService.requestOtp(body);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Tối đa 5 lần đăng ký / 1 phút
  @ResponseMessage('Đăng ký thành công')
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.register(body);
    this.authCookieService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Tối đa 5 lần đăng nhập / 1 phút
  @ResponseMessage('Đăng nhập thành công')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(body);
    this.authCookieService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @ResponseMessage('Cấp lại token thành công')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const oldRefreshToken = req.cookies?.refreshToken;
    const result = await this.authService.refreshToken(oldRefreshToken);
    this.authCookieService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Tối đa 3 lần yêu cầu quên mật khẩu / 1 phút
  @ResponseMessage('Yêu cầu đặt lại mật khẩu thành công')
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Tối đa 5 lần đặt lại mật khẩu / 1 phút
  @ResponseMessage('Đặt lại mật khẩu thành công')
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Tối đa 3 lần gửi lại OTP / 1 phút
  @ResponseMessage('OTP mới đã được gửi thành công')
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() body: ResendOtpDto) {
    return this.authService.resendOtp(body);
  }

  @ResponseMessage('Đăng xuất thành công')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const oldRefreshToken = req.cookies?.refreshToken;
    if (oldRefreshToken) {
      await this.authService.revokeToken(oldRefreshToken);
    }

    this.authCookieService.clearAuthCookies(res);
    return null;
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth(@Req() req: Request) {
    // Guard sẽ chuyển hướng sang trang đăng nhập Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.googleLogin(req);
    this.authCookieService.setAuthCookies(res, result.accessToken, result.refreshToken);

    const frontendUrl = process.env.APP_PUBLIC_URL || 'http://localhost:5173';
    return res.redirect(frontendUrl);
  }
}
