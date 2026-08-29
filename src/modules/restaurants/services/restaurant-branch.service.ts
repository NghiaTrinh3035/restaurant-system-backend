import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRestaurantBranchDto } from '../dto/create-restaurant-branch.dto';
import { UpdateRestaurantBranchDto } from '../dto/update-restaurant-branch.dto';
import { QueryRestaurantBranchDto } from '../dto/query-restaurant-branch.dto';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import { RestaurantBranch, Prisma } from '@prisma/client';

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

    async getRestaurantBranches(query?: QueryRestaurantBranchDto) {
        const where: Prisma.RestaurantBranchWhereInput = {};

        if (query?.status) {
            where.status = query.status;
        }

        if (query?.search && query.search.trim()) {
            const term = query.search.trim();
            where.OR = [
                { name: { contains: term, mode: 'insensitive' } },
                { address: { contains: term, mode: 'insensitive' } },
                { phone: { contains: term, mode: 'insensitive' } },
            ];
        }

        if (!query || (!query.page && !query.limit && !query.search && !query.status)) {
            return this.prismaService.restaurantBranch.findMany({
                where,
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
                where,
                skip,
                take: limit,
                orderBy: {
                    name: 'asc',
                },
            }),
            this.prismaService.restaurantBranch.count({ where }),
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