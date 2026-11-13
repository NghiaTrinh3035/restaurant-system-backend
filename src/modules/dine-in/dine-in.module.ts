import { Module } from '@nestjs/common';
import { DineInController } from './controllers/dine-in.controller';
import { DineInService } from './services/dine-in.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { GatewayModule } from 'src/gateway/gateway.module';

@Module({
  imports: [PrismaModule, GatewayModule],
  controllers: [DineInController],
  providers: [DineInService],
  exports: [DineInService],
})
export class DineInModule {}
