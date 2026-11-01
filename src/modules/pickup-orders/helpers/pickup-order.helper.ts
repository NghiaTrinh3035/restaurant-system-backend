export const PICKUP_TIMEZONE = 'Asia/Ho_Chi_Minh';
/** Đặt trước tối thiểu bao nhiêu phút trước giờ hẹn lấy */
export const MIN_PICKUP_LEAD_TIME_MINUTES = 20;

export function generatePickupCode(dateStr: string): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PU-${cleanDate}-${randomPart}`;
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

export function toDateOnly(dateInput: string | Date): Date {
  const d = typeof dateInput === 'string' ? new Date(`${dateInput}T00:00:00.000Z`) : dateInput;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function getLocalNow(): { date: string; time: string; minutes: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PICKUP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}`;
  return { date, time, minutes: timeStringToMinutes(time) };
}
