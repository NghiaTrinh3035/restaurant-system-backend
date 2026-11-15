import { Module } from '@nestjs/common';
import { GatewayModule } from 'src/gateway/gateway.module';
import { PaymentsController } from './controllers/payments.controller';
import { MomoGatewayService } from './services/momo-gateway.service';
import { PaymentsService } from './services/payments.service';
import { VnpayGatewayService } from './services/vnpay-gateway.service';

@Module({
  imports: [GatewayModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MomoGatewayService, VnpayGatewayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
