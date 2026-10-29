import { Module } from '@nestjs/common';
import { ReservationsController } from './controllers/reservations.controller';
import { ReservationsService } from './services/reservations.service';
import { ReservationAvailabilityService } from './services/reservation-availability.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TablesModule } from 'src/modules/tables/tables.module';
import { GatewayModule } from 'src/gateway/gateway.module';

@Module({
  imports: [PrismaModule, TablesModule, GatewayModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationAvailabilityService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
