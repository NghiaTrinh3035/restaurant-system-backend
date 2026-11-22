import { Module, forwardRef } from '@nestjs/common';
import { GatewayModule } from 'src/gateway/gateway.module';
import { MailModule } from 'src/mail/mail.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationRetentionService } from './services/notification-retention.service';
import { NotificationsService } from './services/notifications.service';
import { PickupReminderService } from './services/pickup-reminder.service';
import { ReservationReminderService } from './services/reservation-reminder.service';

@Module({
  imports: [PrismaModule, forwardRef(() => GatewayModule), MailModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ReservationReminderService,
    PickupReminderService,
    NotificationRetentionService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
