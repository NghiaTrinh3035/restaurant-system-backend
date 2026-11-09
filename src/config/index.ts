import { appConfig } from './app.config';
import { databaseConfig } from './database.config';
import { jwtConfig } from './jwt.config';
import { redisConfig } from './redis.config';
import { mailConfig } from './mail.config';
import { oauthConfig } from './oauth.config';
import { cloudinaryConfig } from './cloudinary.config';

export * from './env.validation';
export * from './app.config';
export * from './database.config';
export * from './jwt.config';
export * from './redis.config';
export * from './mail.config';
export * from './oauth.config';
export * from './cloudinary.config';

export const configs = [
  appConfig,
  databaseConfig,
  jwtConfig,
  redisConfig,
  mailConfig,
  oauthConfig,
  cloudinaryConfig,
];
