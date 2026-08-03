import { Module } from '@nestjs/common';
import { TablesController } from './controllers/tables.controller';
import { TablesService } from './services/tables.service';

@Module({
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
