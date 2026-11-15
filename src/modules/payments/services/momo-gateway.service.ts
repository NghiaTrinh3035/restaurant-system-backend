import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hmacSha256Hex, timingSafeEqualHex } from '../helpers/payment-crypto.helper';

export interface MomoCreatePaymentInput {
  transactionCode: string;
  amount: number;
  orderInfo: string;
}

export interface MomoCallbackRawPayload {
  partnerCode?: string;
  orderId?: string;
  requestId?: string;
  amount?: string | number;
  orderInfo?: string;
  orderType?: string;
  transId?: string | number;
  resultCode?: string | number;
  message?: string;
  payType?: string;
  responseTime?: string | number;
  extraData?: string;
  signature?: string;
}

export interface VerifiedMomoCallback {
  isValidSignature: boolean;
  isSuccess: boolean;
  transactionCode: string;
  amount: number;
  gatewayTransId: string;
  responseCode: string;
  message: string;
}

interface MomoCreateResponse {
  resultCode: number;
  message: string;
  payUrl?: string;
}

@Injectable()
export class MomoGatewayService {
  private readonly logger = new Logger(MomoGatewayService.name);

  constructor(private readonly configService: ConfigService) {}

  async createPayment(input: MomoCreatePaymentInput): Promise<string> {
    const partnerCode = this.configService.getOrThrow<string>('payment.momo.partnerCode');
    const accessKey = this.configService.getOrThrow<string>('payment.momo.accessKey');
    const secretKey = this.configService.getOrThrow<string>('payment.momo.secretKey');
    const endpoint = this.configService.getOrThrow<string>('payment.momo.endpoint');
    const callbackBaseUrl = this.configService.getOrThrow<string>('payment.callbackBaseUrl');
    const appPublicUrl = this.configService.getOrThrow<string>('app.appPublicUrl');

    const redirectUrl = `${appPublicUrl.replace(/\/+$/, '')}/payment/result?provider=MOMO`;
    const ipnUrl = `${callbackBaseUrl.replace(/\/+$/, '')}/api/payments/momo/ipn`;
    const requestType = 'captureWallet';
    const extraData = '';
    const amount = Math.round(input.amount);
    const requestId = input.transactionCode;
    const orderId = input.transactionCode;

    const rawSignature =
      `accessKey=${accessKey}` +
      `&amount=${amount}` +
      `&extraData=${extraData}` +
      `&ipnUrl=${ipnUrl}` +
      `&orderId=${orderId}` +
      `&orderInfo=${input.orderInfo}` +
      `&partnerCode=${partnerCode}` +
      `&redirectUrl=${redirectUrl}` +
      `&requestId=${requestId}` +
      `&requestType=${requestType}`;

    const signature = hmacSha256Hex(secretKey, rawSignature);

    const requestBody = {
      partnerCode,
      partnerName: 'FoodHub Restaurant',
      storeId: partnerCode,
      requestId,
      amount,
      orderId,
      orderInfo: input.orderInfo,
      redirectUrl,
      ipnUrl,
      lang: 'vi',
      requestType,
      autoCapture: true,
      extraData,
      signature,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`MoMo API HTTP ${response.status}: ${errorText}`);
      throw new BadGatewayException('Không thể kết nối cổng thanh toán MoMo. Vui lòng thử lại.');
    }

    const data = (await response.json()) as MomoCreateResponse;
    if (data.resultCode !== 0 || !data.payUrl) {
      this.logger.error(`MoMo tạo thanh toán thất bại (${data.resultCode}): ${data.message}`);
      throw new BadGatewayException(`Khởi tạo thanh toán MoMo thất bại: ${data.message}`);
    }

    return data.payUrl;
  }

  verifyCallback(payload: MomoCallbackRawPayload): VerifiedMomoCallback {
    const partnerCode = this.configService.getOrThrow<string>('payment.momo.partnerCode');
    const accessKey = this.configService.getOrThrow<string>('payment.momo.accessKey');
    const secretKey = this.configService.getOrThrow<string>('payment.momo.secretKey');

    const transactionCode = String(payload.orderId ?? '');
    const amount = Number(payload.amount);
    const gatewayTransId = String(payload.transId ?? '');
    const responseCode = String(payload.resultCode ?? '');
    const message = String(payload.message ?? '');
    const receivedSignature = typeof payload.signature === 'string' ? payload.signature : '';

    if (
      !receivedSignature ||
      !transactionCode ||
      payload.partnerCode !== partnerCode ||
      !Number.isFinite(amount)
    ) {
      return {
        isValidSignature: false,
        isSuccess: false,
        transactionCode,
        amount: 0,
        gatewayTransId,
        responseCode,
        message: 'Dữ liệu callback MoMo không hợp lệ.',
      };
    }

    const extraData = payload.extraData !== undefined ? String(payload.extraData) : '';
    const orderInfo = payload.orderInfo !== undefined ? String(payload.orderInfo) : '';
    const orderType = payload.orderType !== undefined ? String(payload.orderType) : '';
    const payType = payload.payType !== undefined ? String(payload.payType) : '';
    const requestId = payload.requestId !== undefined ? String(payload.requestId) : '';
    const responseTime = payload.responseTime !== undefined ? String(payload.responseTime) : '';

    const rawSignature =
      `accessKey=${accessKey}` +
      `&amount=${amount}` +
      `&extraData=${extraData}` +
      `&message=${message}` +
      `&orderId=${transactionCode}` +
      `&orderInfo=${orderInfo}` +
      `&orderType=${orderType}` +
      `&partnerCode=${partnerCode}` +
      `&payType=${payType}` +
      `&requestId=${requestId}` +
      `&responseTime=${responseTime}` +
      `&resultCode=${responseCode}` +
      `&transId=${gatewayTransId}`;

    const expectedSignature = hmacSha256Hex(secretKey, rawSignature);
    const isValidSignature = timingSafeEqualHex(expectedSignature, receivedSignature);

    return {
      isValidSignature,
      isSuccess: isValidSignature && responseCode === '0',
      transactionCode,
      amount,
      gatewayTransId,
      responseCode,
      message,
    };
  }
}
