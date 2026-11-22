import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

export interface ReservationQrTarget {
  reservationCode: string;
  branchId: string;
}

/**
 * Tạo chuỗi JSON payload tối giản cho mã QR Check-in (không chứa PII như tên/SĐT),
 * tương thích hoàn toàn với máy quét QR tại quầy lễ tân (`parsed.code`).
 */
export function buildReservationQrPayload(target: ReservationQrTarget): string {
  return JSON.stringify({
    code: target.reservationCode,
    branchId: target.branchId,
  });
}

/**
 * Ký HMAC-SHA256 cho mã đặt bàn để tạo đường dẫn ảnh QR công khai an toàn.
 */
export function signReservationQrCode(reservationCode: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`reservation-qr:${reservationCode.trim()}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Kiểm tra chữ ký HMAC-SHA256 của đường dẫn ảnh QR.
 */
export function verifyReservationQrSignature(
  reservationCode: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!reservationCode || !signature || !secret) {
    return false;
  }
  const expected = signReservationQrCode(reservationCode, secret);
  const sigBuf = Buffer.from(signature.trim(), 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Ưu tiên domain public (hoặc tunnel ngrok khi chạy local) để Gmail Proxy tải được ảnh QR.
 */
export function resolvePublicBackendBaseUrl(
  backendPublicUrl?: string,
  paymentCallbackBaseUrl?: string,
): string {
  const primary = (backendPublicUrl || '').trim().replace(/\/+$/, '');
  const callback = (paymentCallbackBaseUrl || '').trim().replace(/\/+$/, '');
  const isLocalPrimary = !primary || /localhost|127\.0\.0\.1/i.test(primary);
  const isUsableCallback =
    Boolean(callback) && !/localhost|127\.0\.0\.1|your-ngrok-domain/i.test(callback);

  if (isLocalPrimary && isUsableCallback) {
    return callback;
  }
  return primary || 'http://localhost:3000';
}

/**
 * Xây dựng URL ảnh PNG mã QR Check-in có chữ ký bảo mật để nhúng vào email.
 */
export function buildReservationQrImageUrl(params: {
  reservationCode: string;
  secret?: string;
  backendPublicUrl?: string;
  paymentCallbackBaseUrl?: string;
}): string {
  const secret =
    params.secret ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_SECRET ||
    'foodhub-qr-secret';
  const baseUrl = resolvePublicBackendBaseUrl(
    params.backendPublicUrl ?? process.env.BACKEND_PUBLIC_URL,
    params.paymentCallbackBaseUrl ?? process.env.PAYMENT_CALLBACK_BASE_URL,
  );
  const sig = signReservationQrCode(params.reservationCode, secret);
  return `${baseUrl}/api/reservations/${encodeURIComponent(params.reservationCode)}/qr.png?sig=${sig}`;
}

/**
 * Sinh Buffer ảnh PNG mã QR Check-in cho đơn đặt bàn.
 */
export async function generateReservationQrPngBuffer(
  target: ReservationQrTarget,
): Promise<Buffer> {
  const payload = buildReservationQrPayload(target);
  return QRCode.toBuffer(payload, {
    type: 'png',
    width: 260,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}
