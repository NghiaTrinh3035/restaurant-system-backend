import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponseDto } from '../dto/api-response.dto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let data = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
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
      // Handle other types of errors (e.g., Prisma errors if you want to map them)
      message = exception.message;
    }

    const apiResponse = new ApiResponseDto(false, message, data);

    response.status(status).json(apiResponse);
  }
}
