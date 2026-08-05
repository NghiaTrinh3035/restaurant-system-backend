import { HttpException, HttpStatus } from '@nestjs/common';

export class EmailAlreadyExistsException extends HttpException {
  constructor() {
    super('Email đã tồn tại trong hệ thống', HttpStatus.CONFLICT);
  }
}

export class InvalidCredentialsException extends HttpException {
  constructor() {
    super('Email hoặc mật khẩu không đúng', HttpStatus.UNAUTHORIZED);
  }
}

export class InvalidRefreshTokenException extends HttpException {
  constructor() {
    super('Refresh token không hợp lệ hoặc đã hết hạn', HttpStatus.UNAUTHORIZED);
  }
}

export class OtpExpiredException extends HttpException {
  constructor() {
    super('Email chưa được yêu cầu OTP hoặc mã OTP đã hết hạn', HttpStatus.GONE);
  }
}

export class InvalidOtpException extends HttpException {
  constructor() {
    super('Mã OTP không hợp lệ', HttpStatus.BAD_REQUEST);
  }
}

export class PasswordMismatchException extends HttpException {
  constructor() {
    super('Mật khẩu xác nhận không khớp', HttpStatus.BAD_REQUEST);
  }
}
