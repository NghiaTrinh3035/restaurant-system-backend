import {
  ExecutionContext,
  Injectable
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride(
      IS_PUBLIC_KEY,
      [
        context.getHandler(),
        context.getClass(),
      ],
    );

    if (isPublic) {
      // Route công khai: vẫn nạp user nếu có token hợp lệ để @CurrentUser() dùng được (khách vãng lai thì bỏ qua)
      try {
        await super.canActivate(context);
      } catch {
        // Không có token / token hết hạn -> tiếp tục như khách
      }
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
