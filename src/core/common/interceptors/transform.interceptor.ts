import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponseDto } from '../../dto/api-response.dto';
import { Reflector } from '@nestjs/core';
import { RESPONSE_MESSAGE } from '../decorators/response-message.decorator';

export interface Response<T> {
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponseDto<T>>
{
  constructor(private reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseDto<T>> {
    const responseMessage =
      this.reflector.get<string>(RESPONSE_MESSAGE, context.getHandler()) ||
      'Request successful';

    return next.handle().pipe(
      map((data) => {
        // If data is already ApiResponseDto, return as is
        if (data && typeof data === 'object' && 'success' in data && 'message' in data) {
          return data;
        }

        // If data has items & meta (Paginated result)
        if (data && typeof data === 'object' && 'items' in data && 'meta' in data) {
          return new ApiResponseDto(true, responseMessage, (data as any).items, (data as any).meta);
        }

        // If data has data & meta
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          return new ApiResponseDto(true, responseMessage, (data as any).data, (data as any).meta);
        }
        
        // Wrap the standard response
        return new ApiResponseDto(true, responseMessage, data);
      }),
    );
  }
}

