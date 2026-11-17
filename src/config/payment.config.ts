import { registerAs } from '@nestjs/config';

export const paymentConfig = registerAs('payment', () => ({
  callbackBaseUrl: process.env.PAYMENT_CALLBACK_BASE_URL as string,
  momo: {
    partnerCode: process.env.MOMO_PARTNER_CODE as string,
    accessKey: process.env.MOMO_ACCESS_KEY as string,
    secretKey: process.env.MOMO_SECRET_KEY as string,
    endpoint: process.env.MOMO_ENDPOINT as string,
  },
  sepay: {
    merchantId: process.env.SEPAY_MERCHANT_ID as string,
    secretKey: process.env.SEPAY_SECRET_KEY as string,
    checkoutUrl: process.env.SEPAY_CHECKOUT_URL as string,
    apiUrl: process.env.SEPAY_API_URL as string,
  },
}));
