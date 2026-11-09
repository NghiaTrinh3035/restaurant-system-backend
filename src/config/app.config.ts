import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT as string, 10),
  nodeEnv: process.env.NODE_ENV,
  appPublicUrl: process.env.APP_PUBLIC_URL,
  backendPublicUrl: process.env.BACKEND_PUBLIC_URL,
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS as string)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}));
