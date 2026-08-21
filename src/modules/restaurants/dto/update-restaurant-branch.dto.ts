import { PartialType } from '@nestjs/swagger';
import { CreateRestaurantBranchDto } from './create-restaurant-branch.dto';

export class UpdateRestaurantBranchDto extends PartialType(CreateRestaurantBranchDto) { }
