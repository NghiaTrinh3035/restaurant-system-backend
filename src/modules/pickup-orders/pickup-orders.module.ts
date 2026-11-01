import { Module } from '@nestjs/common';
import { PickupOrdersController } from './controllers/pickup-orders.controller';
import { PickupOrdersService } from './services/pickup-orders.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { GatewayModule } from 'src/gateway/gateway.module';

@Module({
  imports: [PrismaModule, GatewayModule],
  controllers: [PickupOrdersController],
  providers: [PickupOrdersService],
  exports: [PickupOrdersService],
})
export class PickupOrdersModule {}
