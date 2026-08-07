import { HttpException, HttpStatus } from '@nestjs/common';

export class CustomException extends HttpException {
    constructor(statusCode: HttpStatus, code: string, message: string) {
        super(
            {
                success: false,
                error: { code, message },
            },
            statusCode,
        );
    }
}
