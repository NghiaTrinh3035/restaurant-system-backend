import { Module } from '@nestjs/common';
import { MenuCategoriesController } from './controllers/menu-categories.controller';
import { MenuCategoriesService } from './services/menu-categories.service';
import { MenuItemsController } from './controllers/menu-items.controller';
import { MenuItemsService } from './services/menu-items.service';
import { BranchMenuController } from './controllers/branch-menu.controller';
import { BranchMenuService } from './services/branch-menu.service';

@Module({
  controllers: [MenuCategoriesController, MenuItemsController, BranchMenuController],
  providers: [MenuCategoriesService, MenuItemsService, BranchMenuService],
  exports: [MenuCategoriesService, MenuItemsService, BranchMenuService],
})
export class MenusModule {}
