import { PartialType } from '@nestjs/swagger';
import { CreateRestaurantTableDto } from './restaurant-table.dto';

export class UpdateRestaurantTableDto extends PartialType(CreateRestaurantTableDto) {}
