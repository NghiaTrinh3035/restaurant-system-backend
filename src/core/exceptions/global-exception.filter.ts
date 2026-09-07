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
        const resObj = exceptionResponse as Record<string, any>;
        if (resObj.message !== undefined && resObj.message !== null) {
          message = Array.isArray(resObj.message) ? resObj.message[0] : resObj.message;
        }
        if (resObj.error !== undefined) {
          data = resObj.error;
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
