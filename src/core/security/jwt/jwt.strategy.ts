import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IJwtPayload } from 'src/core/common/interfaces/auth.interface';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(
        configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                ExtractJwt.fromAuthHeaderAsBearerToken(),
                (request: Request) => {
                    return request?.cookies?.accessToken;
                },
            ]),

            ignoreExpiration: false,

            secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });
    }

    async validate(payload: IJwtPayload) {
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                branchId: true,
            },
        });

        if (!user || !user.isActive) {
            throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.');
        }

        return {
            id: user.id,
            email: user.email,
            role: user.role,
            branchId: user.branchId,
            isActive: user.isActive,
        };
    }
}