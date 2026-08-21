import { Injectable } from '@nestjs/common';
import { Response, CookieOptions } from 'express';
import ms, { StringValue } from 'ms';

@Injectable()
export class AuthCookieService {
  private get cookieOptions(): CookieOptions {
    const isProduction = process.env.NODE_ENV !== 'development';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const accessTime = process.env.JWT_ACCESS_EXPIRES_IN || '1d';
    const refreshTime = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
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
