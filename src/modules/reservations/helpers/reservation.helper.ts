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
  stepMinutes = 30,
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
