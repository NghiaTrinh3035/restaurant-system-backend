import { Module } from '@nestjs/common';
import { RestaurantsController } from './controllers/restaurants.controller';
import { RestaurantsService } from './services/restaurants.service';
import { RestaurantBranchController } from './controllers/restaurant-branch.controller';
import { RestaurantBranchService } from './services/restaurant-branch.service';

@Module({
  controllers: [RestaurantsController, RestaurantBranchController],
  providers: [RestaurantsService, RestaurantBranchService],
})
export class RestaurantsModule { }
