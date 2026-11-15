import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  formatVietnamDateTime,
  hmacSha512Hex,
  normalizeClientIp,
  timingSafeEqualHex,
} from '../helpers/payment-crypto.helper';

export interface VnpayCreateUrlInput {
  transactionCode: string;
  amount: number;
  orderInfo: string;
  clientIp: string;
  expiresAt: Date;
}

export interface VerifiedVnpayCallback {
  isValidSignature: boolean;
  isSuccess: boolean;
  transactionCode: string;
  amount: number;
  gatewayTransId: string;
  responseCode: string;
  transactionStatus: string;
}

@Injectable()
export class VnpayGatewayService {
  constructor(private readonly configService: ConfigService) {}

  createPaymentUrl(input: VnpayCreateUrlInput): string {
    const tmnCode = this.configService.getOrThrow<string>('payment.vnpay.tmnCode');
    const hashSecret = this.configService.getOrThrow<string>('payment.vnpay.hashSecret');
    const vnpUrl = this.configService.getOrThrow<string>('payment.vnpay.url');
    const appPublicUrl = this.configService.getOrThrow<string>('app.appPublicUrl');

    const returnUrl = `${appPublicUrl.replace(/\/+$/, '')}/payment/result?provider=VNPAY`;
    const now = new Date();

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.transactionCode,
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: 'other',
      vnp_Amount: String(Math.round(input.amount * 100)),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: normalizeClientIp(input.clientIp),
      vnp_CreateDate: formatVietnamDateTime(now),
      vnp_ExpireDate: formatVietnamDateTime(input.expiresAt),
    };

    const signData = this.buildSortedQueryString(params);
    const secureHash = hmacSha512Hex(hashSecret, signData);

    return `${vnpUrl}?${signData}&vnp_SecureHash=${secureHash}`;
  }

  verifyCallback(rawQuery: Record<string, unknown>): VerifiedVnpayCallback {
    const tmnCode = this.configService.getOrThrow<string>('payment.vnpay.tmnCode');
    const hashSecret = this.configService.getOrThrow<string>('payment.vnpay.hashSecret');

    const receivedHash = typeof rawQuery.vnp_SecureHash === 'string' ? rawQuery.vnp_SecureHash : '';
    const receivedTmnCode = typeof rawQuery.vnp_TmnCode === 'string' ? rawQuery.vnp_TmnCode : '';
    const transactionCode = typeof rawQuery.vnp_TxnRef === 'string' ? rawQuery.vnp_TxnRef : '';
    const gatewayTransId =
      typeof rawQuery.vnp_TransactionNo === 'string' ? rawQuery.vnp_TransactionNo : '';
    const responseCode =
      typeof rawQuery.vnp_ResponseCode === 'string' ? rawQuery.vnp_ResponseCode : '';
    const transactionStatus =
      typeof rawQuery.vnp_TransactionStatus === 'string' ? rawQuery.vnp_TransactionStatus : '';
    const rawAmount = Number(rawQuery.vnp_Amount);
    const amount = Number.isFinite(rawAmount) ? rawAmount / 100 : 0;

    if (!receivedHash || !transactionCode || receivedTmnCode !== tmnCode || !Number.isFinite(rawAmount)) {
      return {
        isValidSignature: false,
        isSuccess: false,
        transactionCode,
        amount: 0,
        gatewayTransId,
        responseCode,
        transactionStatus,
      };
    }

    const vnpParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawQuery)) {
      if (
        key.startsWith('vnp_') &&
        key !== 'vnp_SecureHash' &&
        key !== 'vnp_SecureHashType' &&
        typeof value === 'string' &&
        value.length > 0
      ) {
        vnpParams[key] = value;
      }
    }

    const signData = this.buildSortedQueryString(vnpParams);
    const expectedHash = hmacSha512Hex(hashSecret, signData);
    const isValidSignature = timingSafeEqualHex(expectedHash, receivedHash);

    return {
      isValidSignature,
      isSuccess: isValidSignature && responseCode === '00' && transactionStatus === '00',
      transactionCode,
      amount,
      gatewayTransId,
      responseCode,
      transactionStatus,
    };
  }

  private buildSortedQueryString(params: Record<string, string>): string {
    return Object.keys(params)
      .sort()
      .map((key) => `${this.encodeVnpayValue(key)}=${this.encodeVnpayValue(params[key])}`)
      .join('&');
  }

  private encodeVnpayValue(value: string): string {
    return encodeURIComponent(value).replace(/%20/g, '+');
  }
}
