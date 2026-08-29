import { Module } from '@nestjs/common';
import { MenuCategoriesController } from './controllers/menu-categories.controller';
import { MenuCategoriesService } from './services/menu-categories.service';
import { MenuItemsController } from './controllers/menu-items.controller';
import { MenuItemsService } from './services/menu-items.service';

@Module({
  controllers: [MenuCategoriesController, MenuItemsController],
  providers: [MenuCategoriesService, MenuItemsService],
  exports: [MenuCategoriesService, MenuItemsService],
})
export class MenusModule {}
