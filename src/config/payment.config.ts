import { registerAs } from '@nestjs/config';

export const paymentConfig = registerAs('payment', () => ({
  callbackBaseUrl: process.env.PAYMENT_CALLBACK_BASE_URL as string,
  momo: {
    partnerCode: process.env.MOMO_PARTNER_CODE as string,
    accessKey: process.env.MOMO_ACCESS_KEY as string,
    secretKey: process.env.MOMO_SECRET_KEY as string,
    endpoint: process.env.MOMO_ENDPOINT as string,
  },
}));
