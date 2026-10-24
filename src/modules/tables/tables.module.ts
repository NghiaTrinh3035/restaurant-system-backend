import { Module } from '@nestjs/common';
import { TablesController } from './controllers/tables.controller';
import { TablesService } from './services/tables.service';
import { TableLockService } from './services/table-lock.service';
import { AuthJwtModule } from 'src/core/security/jwt/jwt.module';

@Module({
  imports: [AuthJwtModule],
  controllers: [TablesController],
  providers: [TablesService, TableLockService],
  exports: [TablesService, TableLockService],
})
export class TablesModule {}
