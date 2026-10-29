import { Module, forwardRef } from '@nestjs/common';
import { TablesController } from './controllers/tables.controller';
import { TablesService } from './services/tables.service';
import { TableLockService } from './services/table-lock.service';
import { AuthJwtModule } from 'src/core/security/jwt/jwt.module';
import { GatewayModule } from 'src/gateway/gateway.module';

@Module({
  imports: [AuthJwtModule, forwardRef(() => GatewayModule)],
  controllers: [TablesController],
  providers: [TablesService, TableLockService],
  exports: [TablesService, TableLockService],
})
export class TablesModule {}
