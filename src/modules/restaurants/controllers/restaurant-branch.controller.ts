import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';

import { RestaurantBranchService } from '../services/restaurant-branch.service';

import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';

import { Role } from '@prisma/client';


import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/common/guards/roles.guard';
import { CreateRestaurantBranchDto } from '../dto/create-restaurant-branch.dto';
import { Public } from 'src/core/common/decorators/public.decorator';
import { Roles } from 'src/core/common/decorators/roles.decorator';

@Controller('/restaurants/branches')
export class RestaurantBranchController {

    constructor(
        private readonly restaurantBranchService: RestaurantBranchService,
    ) { }

    // PUBLIC
    @Get()
    @Public()
    @HttpCode(HttpStatus.OK)
    @ResponseMessage('Lấy danh sách chi nhánh nhà hàng thành công.')
    async getRestaurantBranches() {
        return this.restaurantBranchService.getRestaurantBranches();
    }

    // PUBLIC
    @Get('/:id')
    @Public()
    @HttpCode(HttpStatus.OK)
    @ResponseMessage('Lấy thông tin chi nhánh nhà hàng thành công.')
    async getRestaurantBranch(
        @Param('id') id: string,
    ) {
        return this.restaurantBranchService.getRestaurantBranch(id);
    }

    // ADMIN ONLY
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ResponseMessage('Thêm chi nhánh nhà hàng thành công.')
    async createRestaurantBranch(
        @Body() dto: CreateRestaurantBranchDto,
    ) {
        return this.restaurantBranchService.createRestaurantBranch(dto);
    }
}