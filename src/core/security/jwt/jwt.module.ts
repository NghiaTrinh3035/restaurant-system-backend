import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthJwtService } from './auth-jwt.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtModule } from '@nestjs/jwt';

@Module({
    imports: [
        PassportModule.register({
            defaultStrategy: 'jwt',
        }),
        JwtModule.register({})
    ],
    providers: [
        AuthJwtService,
        JwtStrategy,
    ],
    exports: [
        PassportModule,
        AuthJwtService,
        JwtModule
    ],
})
export class AuthJwtModule { }