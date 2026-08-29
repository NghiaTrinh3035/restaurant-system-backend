import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRestaurantBranchDto } from '../dto/create-restaurant-branch.dto';
import { UpdateRestaurantBranchDto } from '../dto/update-restaurant-branch.dto';
import { PaginationQueryDto } from 'src/core/dto/pagination-query.dto';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import { RestaurantBranch } from '@prisma/client';

@Injectable()
export class RestaurantBranchService {
    constructor(
        private readonly prismaService: PrismaService,
    ) { }

    async getRestaurantBranch(id: string): Promise<RestaurantBranch> {
        const restaurantBranch =
            await this.prismaService.restaurantBranch.findUnique({
                where: { id },
            });

        if (!restaurantBranch) {
            throw new NotFoundException(
                'Restaurant branch not found',
            );
        }

        return restaurantBranch;
    }

    async getRestaurantBranches(query?: PaginationQueryDto) {
        if (!query || (!query.page && !query.limit)) {
            return this.prismaService.restaurantBranch.findMany({
                orderBy: {
                    name: 'asc',
                },
            });
        }

        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 10;
        const skip = (page - 1) * limit;

        const [items, totalItems] = await Promise.all([
            this.prismaService.restaurantBranch.findMany({
                skip,
                take: limit,
                orderBy: {
                    name: 'asc',
                },
            }),
            this.prismaService.restaurantBranch.count(),
        ]);

        return {
            items,
            meta: new PaginationMetaDto(page, limit, totalItems),
        };
    }

    async createRestaurantBranch(
        dto: CreateRestaurantBranchDto,
    ): Promise<RestaurantBranch> {
        return this.prismaService.restaurantBranch.create({
            data: dto,
        });
    }

    async updateRestaurantBranch(
        id: string,
        dto: UpdateRestaurantBranchDto,
    ): Promise<RestaurantBranch> {
        await this.getRestaurantBranch(id);

        return this.prismaService.restaurantBranch.update({
            where: { id },
            data: dto,
        });
    }

    async deleteRestaurantBranch(
        id: string,
    ): Promise<RestaurantBranch> {
        await this.getRestaurantBranch(id);

        return this.prismaService.restaurantBranch.delete({
            where: { id },
        });
    }
}