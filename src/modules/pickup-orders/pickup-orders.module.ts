import { Module } from '@nestjs/common';
import { PickupOrdersController } from './controllers/pickup-orders.controller';
import { PickupOrdersService } from './services/pickup-orders.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { GatewayModule } from 'src/gateway/gateway.module';
import { MailModule } from 'src/mail/mail.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PrismaModule, GatewayModule, MailModule, PaymentsModule],
  controllers: [PickupOrdersController],
  providers: [PickupOrdersService],
  exports: [PickupOrdersService],
})
export class PickupOrdersModule {}
