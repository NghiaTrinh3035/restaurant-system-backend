import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  RestaurantBranchStatus,
  RestaurantTableStatus,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueryAvailableSlotsDto } from '../dto/query-available-slots.dto';
import {
  ACTIVE_RESERVATION_STATUSES,
  MAX_ADVANCE_DAYS,
  MIN_LEAD_TIME_MINUTES,
  SLOT_STEP_MINUTES,
  addDaysToDateString,
  generateDailyTimeSlots,
  getLocalNow,
  getSuitableCapacityLimit,
  isTimeRangeOverlap,
  timeStringToMinutes,
  toDateOnly,
} from '../helpers/reservation.helper';

type DbClient = PrismaService | Prisma.TransactionClient;

const branchContextInclude = {
  operatingHours: true,
  tables: {
    where: { isActive: true, status: { not: RestaurantTableStatus.MAINTENANCE } },
    include: { tableType: true },
  },
} satisfies Prisma.RestaurantBranchInclude;

export type BranchContext = Prisma.RestaurantBranchGetPayload<{ include: typeof branchContextInclude }>;
export type BranchTable = BranchContext['tables'][number];

export interface ServiceWindow {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  slotDuration: number;
}

export interface ActiveReservationSlot {
  id: string;
  tableId: string | null;
  userId: string | null;
  customerPhone: string;
  guestCount: number;
  reservationTime: string;
  slotDurationMinutes: number;
}

/**
 * Quy tắc khả dụng của đặt bàn: giờ mở cửa, thời gian đặt trước, sức chứa và trùng khung giờ.
 */
@Injectable()
export class ReservationAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getBranchContext(branchId: string): Promise<BranchContext> {
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: branchId },
      include: branchContextInclude,
    });

    if (!branch || branch.status !== RestaurantBranchStatus.ACTIVE) {
      throw new NotFoundException('Chi nhánh không tồn tại hoặc đã ngừng hoạt động.');
    }
    return branch;
  }

  getServiceWindow(branch: BranchContext, dateStr: string): ServiceWindow {
    const dayOfWeek = toDateOnly(dateStr).getUTCDay();
    const schedule = branch.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);

    return {
      isOpen: schedule ? schedule.isOpen : true,
      openTime: schedule?.openTime || branch.openingTime || '08:00',
      closeTime: schedule?.closeTime || branch.closingTime || '22:00',
      slotDuration: branch.slotDurationMinutes || 90,
    };
  }

  /**
   * Kiểm tra ngày/giờ khách chọn có hợp lệ để đặt bàn hay không (ném lỗi nếu không hợp lệ).
   */
  validateBookingTime(branch: BranchContext, dateStr: string, time: string): ServiceWindow {
    const now = getLocalNow();
    if (dateStr < now.date) {
      throw new BadRequestException('Không thể đặt bàn vào ngày trong quá khứ.');
    }
    if (dateStr > addDaysToDateString(now.date, MAX_ADVANCE_DAYS)) {
      throw new BadRequestException(`Chỉ nhận đặt bàn trước tối đa ${MAX_ADVANCE_DAYS} ngày.`);
    }

    const window = this.getServiceWindow(branch, dateStr);
    if (!window.isOpen) {
      throw new BadRequestException('Chi nhánh không mở cửa phục vụ vào ngày đã chọn.');
    }

    const reqMins = timeStringToMinutes(time);
    const openMins = timeStringToMinutes(window.openTime);
    const closeMins = timeStringToMinutes(window.closeTime);
    if (reqMins < openMins || reqMins + window.slotDuration > closeMins) {
      throw new BadRequestException(
        `Giờ đặt bàn (${time}) nằm ngoài khung giờ nhận khách (${window.openTime} - ${window.closeTime}, cần ${window.slotDuration} phút phục vụ).`,
      );
    }
    if ((reqMins - openMins) % SLOT_STEP_MINUTES !== 0) {
      throw new BadRequestException('Giờ đặt bàn không hợp lệ, vui lòng chọn theo khung giờ gợi ý.');
    }
    if (dateStr === now.date && reqMins < now.minutes + MIN_LEAD_TIME_MINUTES) {
      throw new BadRequestException(
        `Vui lòng đặt bàn trước giờ đến ít nhất ${MIN_LEAD_TIME_MINUTES} phút.`,
      );
    }

    return window;
  }

  getActiveReservations(
    branchId: string,
    dateStr: string,
    client: DbClient = this.prisma,
  ): Promise<ActiveReservationSlot[]> {
    return client.reservation.findMany({
      where: {
        branchId,
        reservationDate: toDateOnly(dateStr),
        status: { in: ACTIVE_RESERVATION_STATUSES },
      },
      select: {
        id: true,
        tableId: true,
        userId: true,
        customerPhone: true,
        guestCount: true,
        reservationTime: true,
        slotDurationMinutes: true,
      },
    });
  }

  filterOverlapping(
    reservations: ActiveReservationSlot[],
    startMins: number,
    duration: number,
  ): ActiveReservationSlot[] {
    return reservations.filter((r) =>
      isTimeRangeOverlap(startMins, duration, timeStringToMinutes(r.reservationTime), r.slotDurationMinutes),
    );
  }

  /**
   * Số bàn phù hợp số khách còn trống trong khung giờ:
   * - Bàn đã gán cho đơn trùng giờ bị loại.
   * - Mỗi đơn trùng giờ chưa gán bàn (nhà hàng tự xếp) chiếm 1 bàn có thể dùng cho nhóm này.
   */
  countRemainingTables(
    tables: BranchTable[],
    reservations: ActiveReservationSlot[],
    guestCount: number,
    startMins: number,
    duration: number,
  ): number {
    const capacities = tables.map((t) => t.tableType.capacity);
    const limit = getSuitableCapacityLimit(guestCount, capacities);
    const overlapping = this.filterOverlapping(reservations, startMins, duration);
    const reservedTableIds = new Set(overlapping.filter((r) => r.tableId).map((r) => r.tableId));

    const freeSuitable = tables.filter((t) => {
      const capacity = t.tableType.capacity;
      return capacity >= guestCount && capacity <= limit && !reservedTableIds.has(t.id);
    });
    const unassignedCompeting = overlapping.filter((r) => !r.tableId && r.guestCount <= limit).length;

    return Math.max(0, freeSuitable.length - unassignedCompeting);
  }

  async getAvailableSlots(query: QueryAvailableSlotsDto) {
    const branch = await this.getBranchContext(query.branchId);
    const guestCount = query.guestCount || 2;
    const window = this.getServiceWindow(branch, query.date);
    const now = getLocalNow();

    const baseResponse = {
      branchId: branch.id,
      branchName: branch.name,
      date: query.date,
      slotDurationMinutes: window.slotDuration,
      openTime: window.openTime,
      closeTime: window.closeTime,
    };

    if (!window.isOpen) {
      return { ...baseResponse, slots: [], message: 'Chi nhánh không mở cửa vào ngày này.' };
    }
    if (query.date < now.date || query.date > addDaysToDateString(now.date, MAX_ADVANCE_DAYS)) {
      return {
        ...baseResponse,
        slots: [],
        message: `Chỉ nhận đặt bàn từ hôm nay đến ${MAX_ADVANCE_DAYS} ngày tới.`,
      };
    }
    if (!branch.tables.some((t) => t.tableType.capacity >= guestCount)) {
      return {
        ...baseResponse,
        slots: [],
        message: `Chi nhánh không có bàn đủ chỗ cho ${guestCount} khách. Vui lòng liên hệ hotline ${branch.phone} để đặt tiệc.`,
      };
    }

    const minStartMins = query.date === now.date ? now.minutes + MIN_LEAD_TIME_MINUTES : -1;
    const timeSlots = generateDailyTimeSlots(
      window.openTime,
      window.closeTime,
      window.slotDuration,
      SLOT_STEP_MINUTES,
    ).filter((time) => timeStringToMinutes(time) >= minStartMins);

    const reservations = await this.getActiveReservations(branch.id, query.date);

    const slots = timeSlots.map((time) => {
      const remaining = this.countRemainingTables(
        branch.tables,
        reservations,
        guestCount,
        timeStringToMinutes(time),
        window.slotDuration,
      );
      return { time, isAvailable: remaining > 0, remainingTables: remaining };
    });

    return {
      ...baseResponse,
      slots,
      message: slots.length === 0 ? 'Đã hết khung giờ nhận đặt bàn trong ngày này.' : undefined,
    };
  }
}
