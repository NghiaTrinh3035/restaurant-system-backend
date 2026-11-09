import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment, {
    message: 'NODE_ENV bắt buộc và phải là một trong: development, production, test',
  })
  NODE_ENV: Environment;

  @Type(() => Number)
  @IsNumber({}, { message: 'PORT bắt buộc và phải là dạng số nguyên' })
  PORT: number;

  @IsString({ message: 'APP_PUBLIC_URL bắt buộc và không được để trống' })
  APP_PUBLIC_URL: string;

  @IsString({ message: 'BACKEND_PUBLIC_URL bắt buộc và không được để trống' })
  BACKEND_PUBLIC_URL: string;

  @IsString({ message: 'CORS_ALLOWED_ORIGINS bắt buộc và không được để trống' })
  CORS_ALLOWED_ORIGINS: string;

  @IsString({ message: 'DATABASE_URL bắt buộc và không được để trống' })
  DATABASE_URL: string;

  @IsString()
  @IsOptional()
  SHADOW_DATABASE_URL?: string;

  @IsString({ message: 'REDIS_HOST bắt buộc và không được để trống' })
  REDIS_HOST: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'REDIS_PORT bắt buộc và phải là dạng số nguyên' })
  REDIS_PORT: number;

  @IsString({ message: 'REDIS_USER bắt buộc và không được để trống' })
  REDIS_USER: string;

  @IsString({ message: 'REDIS_PASS bắt buộc và không được để trống' })
  REDIS_PASS: string;

  @IsString({ message: 'JWT_ACCESS_SECRET bắt buộc và không được để trống' })
  JWT_ACCESS_SECRET: string;

  @IsString({ message: 'JWT_REFRESH_SECRET bắt buộc và không được để trống' })
  JWT_REFRESH_SECRET: string;

  @IsString({ message: 'JWT_ACCESS_EXPIRES_IN bắt buộc và không được để trống' })
  JWT_ACCESS_EXPIRES_IN: string;

  @IsString({ message: 'JWT_REFRESH_EXPIRES_IN bắt buộc và không được để trống' })
  JWT_REFRESH_EXPIRES_IN: string;

  @IsString({ message: 'MAIL_HOST bắt buộc và không được để trống' })
  MAIL_HOST: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'MAIL_PORT bắt buộc và phải là dạng số nguyên' })
  MAIL_PORT: number;

  @IsString({ message: 'MAIL_USER bắt buộc và không được để trống' })
  MAIL_USER: string;

  @IsString({ message: 'MAIL_PASS bắt buộc và không được để trống' })
  MAIL_PASS: string;

  @IsString({ message: 'MAIL_FROM bắt buộc và không được để trống' })
  MAIL_FROM: string;

  @IsString({ message: 'GOOGLE_CLIENT_ID bắt buộc và không được để trống' })
  GOOGLE_CLIENT_ID: string;

  @IsString({ message: 'GOOGLE_CLIENT_SECRET bắt buộc và không được để trống' })
  GOOGLE_CLIENT_SECRET: string;

  @IsString({ message: 'GOOGLE_CALLBACK_URL bắt buộc và không được để trống' })
  GOOGLE_CALLBACK_URL: string;

  @IsString({ message: 'CLOUDINARY_CLOUD_NAME bắt buộc và không được để trống' })
  CLOUDINARY_CLOUD_NAME: string;

  @IsString({ message: 'CLOUDINARY_API_KEY bắt buộc và không được để trống' })
  CLOUDINARY_API_KEY: string;

  @IsString({ message: 'CLOUDINARY_API_SECRET bắt buộc và không được để trống' })
  CLOUDINARY_API_SECRET: string;

  @IsString({ message: 'CLOUDINARY_FOLDER bắt buộc và không được để trống' })
  CLOUDINARY_FOLDER: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorDetails = errors
      .map((err) => {
        const constraints = Object.values(err.constraints || {}).join(', ');
        return `  - [${err.property}]: ${constraints}`;
      })
      .join('\n');

    throw new Error(
      `\n❌ LỖI KHỞI ĐỘNG HỆ THỐNG: Biến môi trường không hợp lệ hoặc bị thiếu:\n${errorDetails}\n`,
    );
  }

  return validatedConfig;
}
