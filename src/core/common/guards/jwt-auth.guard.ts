import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthJwtService } from '../../security/jwt/auth-jwt.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authJwtService: AuthJwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromCookie(request);

    if (!token) {
      throw new UnauthorizedException('Không tìm thấy token truy cập (Cookie bị thiếu hoặc đã hết hạn)');
    }

    try {
      const payload = this.authJwtService.verifyAccessToken(token);
      
      // Gán payload vào object request để các route sau có thể lấy thông qua @CurrentUser()
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException('Token truy cập không hợp lệ hoặc đã hết hạn');
    }
    return true;
  }

  private extractTokenFromCookie(request: Request): string | undefined {
    // Ưu tiên đọc từ cookie trước
    if (request.cookies && request.cookies.accessToken) {
      return request.cookies.accessToken;
    }
    // Hỗ trợ thêm đọc từ Header Authorization: Bearer <token> nếu client gửi header thay vì cookie
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
