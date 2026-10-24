export interface BranchOperatingHourLike {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
}

export interface BranchLike {
  latitude?: number | null;
  longitude?: number | null;
  openingTime?: string | null;
  closingTime?: string | null;
  operatingHours?: BranchOperatingHourLike[];
  [key: string]: any;
}

export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function getVietnamCurrentTime(): { dayOfWeek: number; currentTime: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;
  const hourPart = parts.find((p) => p.type === 'hour')?.value.padStart(2, '0');
  const minutePart = parts.find((p) => p.type === 'minute')?.value.padStart(2, '0');

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dayOfWeek = dayMap[weekdayPart || ''] ?? now.getDay();
  return {
    dayOfWeek,
    currentTime: `${hourPart || '00'}:${minutePart || '00'}`,
  };
}

export function enrichBranchWithStatus<T extends BranchLike>(
  branch: T,
  userLat?: number,
  userLng?: number,
) {
  const { dayOfWeek, currentTime } = getVietnamCurrentTime();

  let isOpenNow = false;
  let todayHours = 'Chưa thiết lập';

  const todayConfig = branch.operatingHours?.find((h) => h.dayOfWeek === dayOfWeek);

  if (todayConfig) {
    if (!todayConfig.isOpen) {
      isOpenNow = false;
      todayHours = 'Đóng cửa hôm nay';
    } else {
      isOpenNow = currentTime >= todayConfig.openTime && currentTime <= todayConfig.closeTime;
      todayHours = `${todayConfig.openTime} - ${todayConfig.closeTime}`;
    }
  } else if (branch.openingTime && branch.closingTime) {
    isOpenNow = currentTime >= branch.openingTime && currentTime <= branch.closingTime;
    todayHours = `${branch.openingTime} - ${branch.closingTime}`;
  }

  let distanceKm: number | null = null;
  if (
    userLat !== undefined &&
    userLng !== undefined &&
    typeof branch.latitude === 'number' &&
    typeof branch.longitude === 'number'
  ) {
    distanceKm = calculateHaversineDistance(
      userLat,
      userLng,
      branch.latitude,
      branch.longitude,
    );
  }

  return {
    ...branch,
    todayHours,
    isOpenNow,
    distanceKm,
  };
}
