import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthJwtService } from './auth-jwt.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
    imports: [
        PassportModule.register({
            defaultStrategy: 'jwt',
        }),
    ],
    providers: [
        AuthJwtService,
        JwtStrategy,
    ],
    exports: [
        PassportModule,
        AuthJwtService,
    ],
})
export class AuthJwtModule { }