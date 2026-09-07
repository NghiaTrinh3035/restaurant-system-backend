import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, CookieOptions } from 'express';
import ms, { StringValue } from 'ms';

@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService) {}

  private get cookieOptions(): CookieOptions {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const accessTime = this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN');
    const refreshTime = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');
    const baseOptions = this.cookieOptions;

    res.cookie('accessToken', accessToken, {
      ...baseOptions,
      maxAge: ms(accessTime as StringValue),
    });

    res.cookie('refreshToken', refreshToken, {
      ...baseOptions,
      maxAge: ms(refreshTime as StringValue),
    });
  }

  clearAuthCookies(res: Response): void {
    const baseOptions = this.cookieOptions;
    res.clearCookie('accessToken', baseOptions);
    res.clearCookie('refreshToken', baseOptions);
  }
}
