import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { TransformInterceptor } from './core/common/interceptors/transform.interceptor';
import { GlobalExceptionFilter } from './core/exceptions/global-exception.filter';
import { Reflector } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parser
  app.use(cookieParser());

  // Parse CORS origins from .env (credentials: true requires explicit origin list, never wildcard '*')
  const rawCors = process.env.CORS_ALLOWED_ORIGINS;
  const corsOrigins = rawCors
    ? rawCors.split(',').map(origin => origin.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

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

  const port = process.env.PORT || 3000;
  await app.listen(port);
}
bootstrap();
