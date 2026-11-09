import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  shadowUrl: process.env.SHADOW_DATABASE_URL,
}));
