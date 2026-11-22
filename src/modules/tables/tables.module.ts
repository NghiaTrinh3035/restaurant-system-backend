import { Module, forwardRef } from '@nestjs/common';
import { TablesController } from './controllers/tables.controller';
import { TablesService } from './services/tables.service';
import { TableLockService } from './services/table-lock.service';
import { AuthJwtModule } from 'src/core/security/jwt/jwt.module';
import { GatewayModule } from 'src/gateway/gateway.module';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';

@Module({
  imports: [
    AuthJwtModule,
    forwardRef(() => GatewayModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [TablesController],
  providers: [TablesService, TableLockService],
  exports: [TablesService, TableLockService],
})
export class TablesModule {}
