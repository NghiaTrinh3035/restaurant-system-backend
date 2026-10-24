import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthJwtService } from './auth-jwt.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly authJwtService: AuthJwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();

    // Nếu đã xác thực trước đó trong connection handshake
    if (client.data?.user) {
      return true;
    }

    const token = this.extractToken(client);
    if (!token) {
      throw new WsException('Yêu cầu xác thực tài khoản để thực hiện hành động này.');
    }

    try {
      const payload = this.authJwtService.verifyAccessToken(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          branchId: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        throw new WsException('Tài khoản không hợp lệ hoặc đã bị khóa.');
      }

      client.data.user = user;
      return true;
    } catch (error) {
      this.logger.warn(`WS Auth failed: ${error.message}`);
      throw new WsException('Token xác thực không hợp lệ hoặc đã hết hạn.');
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake?.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    }

    const headerAuth = client.handshake?.headers?.authorization;
    if (headerAuth && typeof headerAuth === 'string') {
      return headerAuth.startsWith('Bearer ') ? headerAuth.slice(7) : headerAuth;
    }

    return null;
  }
}
