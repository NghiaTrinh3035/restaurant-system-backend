import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hmacSha256Base64, timingSafeEqualString } from '../helpers/payment-crypto.helper';

export interface SepayCreatePaymentInput {
  transactionCode: string;
  amount: number;
  orderInfo: string;
  paymentMethod?: 'CARD' | 'BANK_TRANSFER' | 'NAPAS_BANK_TRANSFER';
}

export interface SepayIpnPayload {
  timestamp?: number;
  notification_type: string;
  order?: {
    id?: string;
    order_id?: string;
    order_status?: string;
    order_currency?: string;
    order_amount?: string | number;
    order_invoice_number?: string;
    custom_data?: unknown[];
    user_agent?: string;
    ip_address?: string;
    order_description?: string;
  };
  transaction?: {
    id?: string;
    payment_method?: string;
    transaction_id?: string;
    transaction_type?: string;
    transaction_date?: string;
    transaction_status?: string;
    transaction_amount?: string | number;
    transaction_currency?: string;
  };
  customer?: {
    id?: string;
    customer_id?: string;
  };
}

export interface VerifiedSepayIpn {
  isValidSecret: boolean;
  isSuccess: boolean;
  transactionCode: string;
  amount: number;
  gatewayTransId: string;
  responseCode: string;
  message: string;
}

export interface SepayOrderDetailResult {
  found: boolean;
  orderStatus: string;
  amount: number;
  gatewayTransId: string;
  transactionStatus: string;
  rawPayload: Record<string, unknown>;
}

@Injectable()
export class SepayGatewayService {
  private readonly logger = new Logger(SepayGatewayService.name);

  constructor(private readonly configService: ConfigService) {}

  async createPayment(input: SepayCreatePaymentInput): Promise<string> {
    const merchantId = this.configService.getOrThrow<string>('payment.sepay.merchantId');
    const secretKey = this.configService.getOrThrow<string>('payment.sepay.secretKey');
    const checkoutUrl = this.configService.getOrThrow<string>('payment.sepay.checkoutUrl');
    const appPublicUrl = this.configService.getOrThrow<string>('app.appPublicUrl');

    const amount = Math.round(input.amount);
    const baseResultUrl = `${appPublicUrl.replace(/\/+$/, '')}/payment/result?provider=SEPAY&order_invoice_number=${input.transactionCode}`;
    const successUrl = `${baseResultUrl}&sepayStatus=success`;
    const errorUrl = `${baseResultUrl}&sepayStatus=error`;
    const cancelUrl = `${baseResultUrl}&sepayStatus=cancel`;

    const fields: Record<string, string> = {
      order_amount: String(amount),
      merchant: merchantId,
      currency: 'VND',
      operation: 'PURCHASE',
      order_description: input.orderInfo,
      order_invoice_number: input.transactionCode,
      success_url: successUrl,
      error_url: errorUrl,
      cancel_url: cancelUrl,
    };

    if (input.paymentMethod) {
      fields.payment_method = input.paymentMethod;
    }

    const allowedFields = [
      'order_amount',
      'merchant',
      'currency',
      'operation',
      'order_description',
      'order_invoice_number',
      'customer_id',
      'payment_method',
      'success_url',
      'error_url',
      'cancel_url',
    ];

    const signedParts: string[] = [];
    const bodyParams = new URLSearchParams();
    for (const field of allowedFields) {
      const val = fields[field];
      if (val !== undefined && val !== '' && val !== '0' && val !== '0.00') {
        signedParts.push(`${field}=${val}`);
        bodyParams.append(field, val);
      }
    }

    const signString = signedParts.join(',');
    const signature = hmacSha256Base64(secretKey, signString);
    bodyParams.append('signature', signature);

    const response = await fetch(checkoutUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        return location;
      }
    }

    if (response.ok) {
      const responseText = await response.text();
      try {
        const json = JSON.parse(responseText) as { pay_url?: string; url?: string };
        const checkoutRedirect = json.pay_url || json.url;
        if (checkoutRedirect) {
          return checkoutRedirect;
        }
      } catch {
        // Không phải JSON phản hồi
      }
    }

    const errorText = await response.text().catch(() => '');
    this.logger.error(`Khởi tạo thanh toán SePay thất bại [${response.status}]: ${errorText}`);
    throw new BadGatewayException('Không thể kết nối cổng thanh toán SePay. Vui lòng thử lại.');
  }

  verifyIpn(headers: Record<string, string | string[] | undefined>, payload: SepayIpnPayload): VerifiedSepayIpn {
    const configuredSecret = this.configService.getOrThrow<string>('payment.sepay.secretKey');

    const receivedSecret =
      typeof headers['x-secret-key'] === 'string'
        ? headers['x-secret-key']
        : Array.isArray(headers['x-secret-key'])
          ? headers['x-secret-key'][0]
          : typeof headers['X-Secret-Key'] === 'string'
            ? headers['X-Secret-Key']
            : '';

    const isValidSecret = timingSafeEqualString(configuredSecret, receivedSecret);

    const transactionCode = payload.order?.order_invoice_number ?? '';
    const rawAmount = payload.order?.order_amount ?? payload.transaction?.transaction_amount ?? 0;
    const amount = Number(rawAmount);
    const gatewayTransId = payload.transaction?.transaction_id ?? payload.order?.id ?? '';
    const orderStatus = payload.order?.order_status ?? '';
    const transStatus = payload.transaction?.transaction_status ?? '';
    const notificationType = payload.notification_type;

    const isSuccess =
      isValidSecret &&
      notificationType === 'ORDER_PAID' &&
      orderStatus === 'CAPTURED' &&
      (transStatus === 'APPROVED' || transStatus === '');

    return {
      isValidSecret,
      isSuccess,
      transactionCode,
      amount,
      gatewayTransId,
      responseCode: orderStatus || notificationType,
      message: isSuccess ? 'Thanh toán SePay thành công' : 'Thanh toán SePay không thành công hoặc không hợp lệ',
    };
  }

  /** Chủ động truy vấn trạng thái đơn hàng từ SePay API khi IPN chưa kịp gọi về */
  async fetchOrderStatus(transactionCode: string): Promise<SepayOrderDetailResult | null> {
    const merchantId = this.configService.getOrThrow<string>('payment.sepay.merchantId');
    const secretKey = this.configService.getOrThrow<string>('payment.sepay.secretKey');
    const apiUrl = this.configService.getOrThrow<string>('payment.sepay.apiUrl').replace(/\/+$/, '');
    const basicAuth = Buffer.from(`${merchantId}:${secretKey}`).toString('base64');

    try {
      const response = await fetch(`${apiUrl}/v1/order/detail/${encodeURIComponent(transactionCode)}`, {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status !== 404) {
          this.logger.warn(`Truy vấn trạng thái SePay thất bại [${response.status}] cho ${transactionCode}`);
        }
        return null;
      }

      const rawJson = (await response.json()) as Record<string, unknown>;
      const data = rawJson.data as
        | {
            order_id?: string;
            order_status?: string;
            order_amount?: string | number;
            transactions?: Array<{
              id?: string;
              transaction_status?: string;
              transaction_amount?: string | number;
            }>;
          }
        | undefined;
      if (!data) {
        return null;
      }

      const approvedOrFirstTx =
        data.transactions?.find((t) => t.transaction_status === 'APPROVED') ?? data.transactions?.[0];

      return {
        found: true,
        orderStatus: data.order_status ?? '',
        amount: Number(data.order_amount ?? approvedOrFirstTx?.transaction_amount ?? 0),
        gatewayTransId: approvedOrFirstTx?.id ?? data.order_id ?? '',
        transactionStatus: approvedOrFirstTx?.transaction_status ?? '',
        rawPayload: rawJson,
      };
    } catch (err) {
      this.logger.warn(
        `Lỗi kết nối truy vấn đơn SePay ${transactionCode}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
