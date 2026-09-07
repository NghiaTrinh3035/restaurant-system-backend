import {
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRestaurantBranchDto } from '../dto/create-restaurant-branch.dto';
import { UpdateRestaurantBranchDto } from '../dto/update-restaurant-branch.dto';
import { QueryRestaurantBranchDto } from '../dto/query-restaurant-branch.dto';
import { UpdateBranchOperatingHoursDto } from '../dto/branch-operating-hours.dto';
import { PaginationMetaDto } from 'src/core/dto/api-response.dto';
import { RestaurantBranch, RestaurantBranchStatus, Prisma, Role } from '@prisma/client';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';

@Injectable()
export class RestaurantBranchService {
    constructor(
        private readonly prismaService: PrismaService,
    ) { }

    async getRestaurantBranch(id: string): Promise<RestaurantBranch> {
        const restaurantBranch =
            await this.prismaService.restaurantBranch.findUnique({
                where: { id },
                include: {
                    province: true,
                    ward: true,
                }
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
                { streetAddress: { contains: term, mode: 'insensitive' } },
                { phone: { contains: term, mode: 'insensitive' } },
            ];
        }

        if (!query || (!query.page && !query.limit && !query.search && !query.status)) {
            return this.prismaService.restaurantBranch.findMany({
                where,
                orderBy: {
                    name: 'asc',
                },
                include: {
                    province: true,
                    ward: true,
                }
            });
        }

        const page = query ? query.page : 1;
        const limit = query ? query.limit : 10;
        const skip = (page - 1) * limit;

        const [items, totalItems] = await Promise.all([
            this.prismaService.restaurantBranch.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    name: 'asc',
                },
                include: {
                    province: true,
                    ward: true,
                }
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
        const { address, ...rest } = dto;
        return this.prismaService.restaurantBranch.create({
            data: {
                ...rest,
                provinceCode: address.provinceCode,
                wardCode: address.wardCode,
                streetAddress: address.detail,
            },
        });
    }

    async updateRestaurantBranch(
        id: string,
        dto: UpdateRestaurantBranchDto,
    ): Promise<RestaurantBranch> {
        await this.getRestaurantBranch(id);

        const { address, ...rest } = dto;
        const dataToUpdate: any = { ...rest };
        if (address) {
            dataToUpdate.provinceCode = address.provinceCode;
            dataToUpdate.wardCode = address.wardCode;
            dataToUpdate.streetAddress = address.detail;
        }

        return this.prismaService.restaurantBranch.update({
            where: { id },
            data: dataToUpdate,
        });
    }

    async deleteRestaurantBranch(
        id: string,
    ): Promise<RestaurantBranch> {
        await this.getRestaurantBranch(id);

        return this.prismaService.restaurantBranch.update({
            where: { id },
            data: {
                status: RestaurantBranchStatus.INACTIVE,
            },
        });
    }

    async getProvinces() {
        return this.prismaService.province.findMany({
            orderBy: { name: 'asc' }
        });
    }

    async getWardsByProvince(provinceCode: string) {
        return this.prismaService.ward.findMany({
            where: { provinceCode },
            orderBy: { name: 'asc' }
        });
    }

    /**
     * Kiểm tra quyền truy cập chi nhánh:
     * - ADMIN: Toàn quyền
     * - STAFF: Chỉ được thao tác trên chi nhánh mình công tác
     */
    async validateBranchAccess(branchId: string, user?: ICurrentUser) {
        const branch = await this.prismaService.restaurantBranch.findUnique({
            where: { id: branchId },
        });

        if (!branch) {
            throw new NotFoundException('Không tìm thấy chi nhánh.');
        }

        if (user && user.role === Role.STAFF) {
            const staffUser = await this.prismaService.user.findUnique({
                where: { id: user.id },
                select: { branchId: true },
            });

            if (!staffUser || staffUser.branchId !== branchId) {
                throw new ForbiddenException('Bạn không có quyền quản lý thông tin của chi nhánh này.');
            }
        }

        return branch;
    }

    /**
     * Lấy cấu hình giờ hoạt động chung + chi tiết 7 ngày trong tuần
     */
    async getOperatingHours(branchId: string, user?: ICurrentUser) {
        const branch = await this.prismaService.restaurantBranch.findUnique({
            where: { id: branchId },
            include: {
                operatingHours: {
                    orderBy: { dayOfWeek: 'asc' },
                },
            },
        });

        if (!branch) {
            throw new NotFoundException('Không tìm thấy chi nhánh.');
        }

        if (user && user.role === Role.STAFF) {
            await this.validateBranchAccess(branchId, user);
        }

        // Tự động khởi tạo đầy đủ 7 ngày nếu chi nhánh chưa có đủ
        let hours = branch.operatingHours;
        if (!hours || hours.length < 7) {
            const existingDays = new Set(hours ? hours.map((h) => h.dayOfWeek) : []);
            const toCreate: any[] = [];
            for (let day = 0; day <= 6; day++) {
                if (!existingDays.has(day)) {
                    toCreate.push({
                        branchId,
                        dayOfWeek: day,
                        ...(branch.openingTime ? { openTime: branch.openingTime } : {}),
                        ...(branch.closingTime ? { closeTime: branch.closingTime } : {}),
                        isOpen: true,
                    });
                }
            }

            if (toCreate.length > 0) {
                await this.prismaService.branchOperatingHours.createMany({
                    data: toCreate,
                    skipDuplicates: true,
                });

                hours = await this.prismaService.branchOperatingHours.findMany({
                    where: { branchId },
                    orderBy: { dayOfWeek: 'asc' },
                });
            }
        }

        return {
            branchId: branch.id,
            branchName: branch.name,
            openingTime: branch.openingTime,
            closingTime: branch.closingTime,
            slotDurationMinutes: branch.slotDurationMinutes,
            dailyHours: hours,
        };
    }

    /**
     * Cập nhật giờ hoạt động của chi nhánh
     */
    async updateOperatingHours(
        branchId: string,
        dto: UpdateBranchOperatingHoursDto,
        user: ICurrentUser,
    ) {
        await this.validateBranchAccess(branchId, user);

        const updateData: any = {};
        if (dto.openingTime !== undefined) updateData.openingTime = dto.openingTime;
        if (dto.closingTime !== undefined) updateData.closingTime = dto.closingTime;
        if (dto.slotDurationMinutes !== undefined) updateData.slotDurationMinutes = dto.slotDurationMinutes;

        if (Object.keys(updateData).length > 0) {
            await this.prismaService.restaurantBranch.update({
                where: { id: branchId },
                data: updateData,
            });
        }

        if (dto.dailyHours && Array.isArray(dto.dailyHours)) {
            for (const day of dto.dailyHours) {
                await this.prismaService.branchOperatingHours.upsert({
                    where: {
                        branchId_dayOfWeek: {
                            branchId,
                            dayOfWeek: day.dayOfWeek,
                        },
                    },
                    create: {
                        branchId,
                        dayOfWeek: day.dayOfWeek,
                        openTime: day.openTime,
                        closeTime: day.closeTime,
                        isOpen: day.isOpen,
                    },
                    update: {
                        openTime: day.openTime,
                        closeTime: day.closeTime,
                        isOpen: day.isOpen,
                    },
                });
            }
        }

        return this.getOperatingHours(branchId);
    }

    /**
     * Lấy thống kê sức chứa (Capacity) bàn ghế của chi nhánh
     */
    async getBranchCapacity(branchId: string, user?: ICurrentUser) {
        const branch = await this.validateBranchAccess(branchId, user);

        const tables = await this.prismaService.restaurantTable.findMany({
            where: {
                branchId,
                isActive: true,
            },
            include: {
                tableType: true,
            },
            orderBy: [
                { floor: 'asc' },
                { tableNumber: 'asc' },
            ],
        });

        const totalTables = tables.length;
        let totalSeats = 0;

        const typeMap = new Map<
            string,
            { id: string; name: string; capacity: number; tableCount: number; totalSeats: number }
        >();

        for (const t of tables) {
            if (!t.tableType) continue;
            const cap = t.tableType.capacity;
            totalSeats += cap;

            let existing = typeMap.get(t.tableTypeId);
            if (!existing) {
                existing = {
                    id: t.tableTypeId,
                    name: t.tableType.name,
                    capacity: cap,
                    tableCount: 0,
                    totalSeats: 0,
                };
                typeMap.set(t.tableTypeId, existing);
            }
            existing.tableCount += 1;
            existing.totalSeats += cap;
        }

        const byTableType = Array.from(typeMap.values()).sort((a, b) => a.capacity - b.capacity);

        return {
            branchId: branch.id,
            branchName: branch.name,
            openingTime: branch.openingTime,
            closingTime: branch.closingTime,
            slotDurationMinutes: branch.slotDurationMinutes,
            totalTables,
            totalSeats,
            byTableType,
        };
    }
}