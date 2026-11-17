import * as crypto from 'crypto';

const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function hmacSha256Hex(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

export function hmacSha256Base64(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('base64');
}

export function timingSafeEqualHex(expectedHex: string, receivedHex: string): boolean {
  if (!expectedHex || !receivedHex) {
    return false;
  }
  const normalizedExpected = expectedHex.trim().toLowerCase();
  const normalizedReceived = receivedHex.trim().toLowerCase();
  const expectedBuf = Buffer.from(normalizedExpected, 'utf8');
  const receivedBuf = Buffer.from(normalizedReceived, 'utf8');
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

export function timingSafeEqualString(expected: string, received: string): boolean {
  if (!expected || !received) {
    return false;
  }
  const expectedBuf = Buffer.from(expected.trim(), 'utf8');
  const receivedBuf = Buffer.from(received.trim(), 'utf8');
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/** Định dạng yyyyMMddHHmmss theo múi giờ Việt Nam (UTC+7) */
export function formatVietnamDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    if (!part) {
      throw new Error(`Không thể trích xuất thành phần thời gian: ${type}`);
    }
    return part.value;
  };

  return (
    `${getPart('year')}${getPart('month')}${getPart('day')}` +
    `${getPart('hour')}${getPart('minute')}${getPart('second')}`
  );
}

/** Chuẩn hóa IP client về IPv4 hợp lệ */
export function normalizeClientIp(rawIp: string | undefined): string {
  if (!rawIp) {
    return '127.0.0.1';
  }
  const firstIp = rawIp.split(',')[0].trim();
  if (firstIp === '::1' || firstIp === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }
  if (firstIp.startsWith('::ffff:')) {
    return firstIp.slice('::ffff:'.length);
  }
  return firstIp;
}

/** Sinh mã giao dịch duy nhất bằng crypto.randomBytes (chỉ chữ và số) */
export function generateTransactionCode(prefix: string): string {
  const timestamp = formatVietnamDateTime(new Date());
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}${timestamp}${randomSuffix}`;
}
