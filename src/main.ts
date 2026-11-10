import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Đảm bảo toàn bộ Date/log trong Node.js vận hành theo múi giờ Việt Nam ngay từ lúc khởi động
process.env.TZ = 'Asia/Ho_Chi_Minh';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { TransformInterceptor } from './core/common/interceptors/transform.interceptor';
import { GlobalExceptionFilter } from './core/common/filters/global-exception.filter';
import { Reflector } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Enable cookie parser
  app.use(cookieParser());

  // Parse CORS origins from .env (credentials: true requires explicit origin list, never wildcard '*')
  const corsOrigins = configService.getOrThrow<string[]>('app.corsAllowedOrigins');

  // Enable CORS
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global API Prefix
  app.setGlobalPrefix('api');

  // Global Interceptor and Filter
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('Restaurant Reservation API')
    .setDescription('The Restaurant Reservation Management System API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
}
void bootstrap();
