import { Module, forwardRef } from '@nestjs/common';
import { GatewayModule } from 'src/gateway/gateway.module';
import { MailModule } from 'src/mail/mail.module';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { TablesModule } from 'src/modules/tables/tables.module';
import { PaymentsController } from './controllers/payments.controller';
import { MomoGatewayService } from './services/momo-gateway.service';
import { PaymentsService } from './services/payments.service';
import { SepayGatewayService } from './services/sepay-gateway.service';

@Module({
  imports: [GatewayModule, MailModule, NotificationsModule, forwardRef(() => TablesModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, MomoGatewayService, SepayGatewayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
