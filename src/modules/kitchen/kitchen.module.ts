import { Module } from '@nestjs/common';
import { KitchenController } from './controllers/kitchen.controller';
import { KitchenService } from './services/kitchen.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { GatewayModule } from 'src/gateway/gateway.module';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { PickupOrdersModule } from 'src/modules/pickup-orders/pickup-orders.module';

@Module({
  imports: [PrismaModule, GatewayModule, PickupOrdersModule, NotificationsModule],
  controllers: [KitchenController],
  providers: [KitchenService],
  exports: [KitchenService],
})
export class KitchenModule {}

