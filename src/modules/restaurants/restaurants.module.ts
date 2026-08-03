import { Module } from '@nestjs/common';
import { RestaurantsController } from './controllers/restaurants.controller';
import { RestaurantsService } from './services/restaurants.service';

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
})
export class RestaurantsModule {}
