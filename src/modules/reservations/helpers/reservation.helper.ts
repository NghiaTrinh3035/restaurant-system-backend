import { ReservationStatus } from '@prisma/client';

/** Múi giờ vận hành của nhà hàng (mọi so sánh ngày/giờ đặt bàn đều theo giờ Việt Nam) */
export const RESERVATION_TIMEZONE = 'Asia/Ho_Chi_Minh';
/** Bước nhảy giữa các khung giờ đặt bàn */
export const SLOT_STEP_MINUTES = 30;
/** Phải đặt trước giờ đến tối thiểu bao nhiêu phút */
export const MIN_LEAD_TIME_MINUTES = 30;
/** Chỉ nhận đặt bàn trước tối đa bao nhiêu ngày */
export const MAX_ADVANCE_DAYS = 30;
/** Các trạng thái đơn còn chiếm bàn */
export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.SEATED,
];

export function generateReservationCode(dateStr: string): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `RES-${cleanDate}-${randomPart}`;
}

export function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function generateDailyTimeSlots(
  openTime: string,
  closeTime: string,
  slotDurationMinutes = 90,
  stepMinutes = SLOT_STEP_MINUTES,
): string[] {
  const startMins = timeStringToMinutes(openTime);
  const endMins = timeStringToMinutes(closeTime);
  const latestBookingMins = endMins - slotDurationMinutes;

  if (latestBookingMins < startMins) {
    return [];
  }

  const slots: string[] = [];
  for (let m = startMins; m <= latestBookingMins; m += stepMinutes) {
    slots.push(minutesToTimeString(m));
  }
  return slots;
}

/** Ngày (YYYY-MM-DD) và số phút trong ngày hiện tại theo giờ nhà hàng */
export function getLocalNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESERVATION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Chuyển 'YYYY-MM-DD' thành Date lưu cột @db.Date */
export function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const d = toDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

/** Hai khoảng [start, start + duration) có giao nhau hay không */
export function isTimeRangeOverlap(
  aStart: number,
  aDuration: number,
  bStart: number,
  bDuration: number,
): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

/** Giờ đến của đơn đã bắt đầu (hoặc đã qua) so với hiện tại */
export function hasReservationStarted(reservationDate: Date, reservationTime: string): boolean {
  const now = getLocalNow();
  const dateStr = toDateString(reservationDate);
  if (dateStr !== now.date) return dateStr < now.date;
  return timeStringToMinutes(reservationTime) <= now.minutes;
}

/**
 * Sức chứa tối đa được xếp cho một nhóm khách: tránh để nhóm 2 người chiếm bàn 10 chỗ.
 * Luôn cho phép loại bàn nhỏ nhất đủ chỗ của chi nhánh để không chặn khách khi chi nhánh chỉ có bàn lớn.
 */
export function getSuitableCapacityLimit(guestCount: number, branchCapacities: number[]): number {
  const fitting = branchCapacities.filter((c) => c >= guestCount);
  const smallestFit = fitting.length > 0 ? Math.min(...fitting) : guestCount;
  return Math.max(guestCount * 2, 4, smallestFit);
}

export function isCapacitySuitable(
  capacity: number,
  guestCount: number,
  branchCapacities: number[],
): boolean {
  return capacity >= guestCount && capacity <= getSuitableCapacityLimit(guestCount, branchCapacities);
}
