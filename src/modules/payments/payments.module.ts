import { Module } from '@nestjs/common';
import { GatewayModule } from 'src/gateway/gateway.module';
import { MailModule } from 'src/mail/mail.module';
import { PaymentsController } from './controllers/payments.controller';
import { MomoGatewayService } from './services/momo-gateway.service';
import { PaymentsService } from './services/payments.service';
import { SepayGatewayService } from './services/sepay-gateway.service';

@Module({
  imports: [GatewayModule, MailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MomoGatewayService, SepayGatewayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
