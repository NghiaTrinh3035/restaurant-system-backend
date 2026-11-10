import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT as string, 10),
  user: process.env.REDIS_USER,
  pass: process.env.REDIS_PASS,
}));
