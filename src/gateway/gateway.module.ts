import { Module } from '@nestjs/common';
import { TablesGateway } from './tables.gateway';
import { WsJwtGuard } from 'src/core/security/jwt/ws-jwt.guard';
import { TablesModule } from 'src/modules/tables/tables.module';
import { AuthJwtModule } from 'src/core/security/jwt/jwt.module';

@Module({
  imports: [TablesModule, AuthJwtModule],
  providers: [TablesGateway, WsJwtGuard],
  exports: [TablesGateway],
})
export class GatewayModule {}
