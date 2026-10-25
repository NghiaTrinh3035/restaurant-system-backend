import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RestaurantBranchStatus, RestaurantTableStatus } from '@prisma/client';
import { QueryAvailableSlotsDto } from '../dto/query-available-slots.dto';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailableSlots(dto: QueryAvailableSlotsDto) {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: dto.branchId },
      include: {
        operatingHours: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });

    if (!branch || branch.status !== RestaurantBranchStatus.ACTIVE) {
      throw new NotFoundException('Chi nhánh không tồn tại hoặc đã ngừng hoạt động');
    }

    // Xác định thứ trong tuần (0: Chủ nhật, 1: Thứ 2, ..., 6: Thứ 7)
    const dateParts = dto.date.split('-').map(Number);
    const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const dayOfWeek = dateObj.getDay();

    const schedule = branch.operatingHours?.find((h) => h.dayOfWeek === dayOfWeek);
    const isOpen = schedule ? schedule.isOpen : true;

    if (!isOpen) {
      return {
        branchId: branch.id,
        branchName: branch.name,
        date: dto.date,
        slotDurationMinutes: branch.slotDurationMinutes || 90,
        slots: [],
      };
    }

    const openTimeStr = (schedule && schedule.openTime) || branch.openingTime || '09:00';
    const closeTimeStr = (schedule && schedule.closeTime) || branch.closingTime || '22:00';
    const slotDuration = branch.slotDurationMinutes || 90;

    // Tính toán số lượng bàn khả dụng phù hợp số khách
    const suitableTablesCount = await this.prisma.restaurantTable.count({
      where: {
        branchId: dto.branchId,
        isActive: true,
        status: RestaurantTableStatus.AVAILABLE,
        ...(dto.guestCount
          ? {
              tableType: {
                capacity: {
                  gte: Number(dto.guestCount),
                },
              },
            }
          : {}),
      },
    });

    // Sinh các khung giờ cách nhau 30 phút từ openTime đến trước closeTime 60 phút
    const [openH, openM] = openTimeStr.split(':').map(Number);
    const [closeH, closeM] = closeTimeStr.split(':').map(Number);

    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;
    const lastSlotMinutes = closeMinutes - 60; // Ngừng nhận khách trước giờ đóng cửa 1 tiếng

    // Kiểm tra nếu là ngày hôm nay thì so sánh giờ hiện tại
    const today = new Date();
    const isToday =
      today.getFullYear() === dateParts[0] &&
      today.getMonth() === dateParts[1] - 1 &&
      today.getDate() === dateParts[2];
    const currentMinutes = today.getHours() * 60 + today.getMinutes();

    const slots: { time: string; isAvailable: boolean; remainingTables: number }[] = [];

    for (let m = openMinutes; m <= lastSlotMinutes; m += 30) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const timeStr = `${h < 10 ? '0' : ''}${h}:${min < 10 ? '0' : ''}${min}`;

      // Nếu là hôm nay và giờ đã qua thì không khả dụng
      const isPast = isToday && m <= currentMinutes + 15; // Phải đặt trước ít nhất 15 phút
      const isAvailable = !isPast && suitableTablesCount > 0;

      slots.push({
        time: timeStr,
        isAvailable,
        remainingTables: isAvailable ? suitableTablesCount : 0,
      });
    }

    return {
      branchId: branch.id,
      branchName: branch.name,
      date: dto.date,
      slotDurationMinutes: slotDuration,
      slots,
    };
  }
}
