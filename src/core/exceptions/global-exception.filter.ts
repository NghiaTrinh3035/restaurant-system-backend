import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { ApiResponseDto } from '../dto/api-response.dto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let data = null;

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      message = 'Hệ thống nhận thấy quá nhiều yêu cầu từ bạn. Vui lòng thử lại sau giây lát!';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        message = 'Hệ thống nhận thấy quá nhiều yêu cầu từ bạn. Vui lòng thử lại sau giây lát!';
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        message = (exceptionResponse as any).message || message;
        data = (exceptionResponse as any).error || null;
        
        // Handle class-validator validation errors array
        if (Array.isArray(message)) {
          message = message[0]; // Or join them if preferred
        }
      }
    } else if (exception instanceof Error) {
      // Tránh làm lộ cấu trúc DB hoặc thông tin nhạy cảm ở production
      const isDev = process.env.NODE_ENV === 'development';
      message = isDev ? exception.message : 'Đã có lỗi hệ thống xảy ra. Vui lòng thử lại sau!';
      console.error('Unhandled System Exception:', exception);
    }

    const apiResponse = new ApiResponseDto(false, message, data);

    response.status(status).json(apiResponse);
  }
}
