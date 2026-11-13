/** Múi giờ vận hành của nhà hàng */
export const RESTAURANT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Sinh mã hóa đơn độc nhất theo ngày: INV-YYYYMMDD-XXXX
 */
export function generateInvoiceCode(dateStr?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dateStr ? new Date(dateStr) : new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const cleanDate = `${get('year')}${get('month')}${get('day')}`;

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `INV-${cleanDate}-${randomPart}`;
}

export function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function getLocalNow(date: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}
