import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from '../dtos/register.dto';
import { RequestRegisterOtpDto } from '../dtos/request-register-otp.dto';
import { ResendOtpDto } from '../dtos/resend-otp.dto';
import { ForgotPasswordDto } from '../dtos/forgot-password.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { AuthProvider, Role } from '@prisma/client';
import { LoginDto } from '../dtos/login.dto';
import { PasswordService } from 'src/core/security/password/password.service';
import { AuthJwtService } from 'src/core/security/jwt/auth-jwt.service';
import { OtpService } from './otp.service';
import { MailService } from 'src/mail/mail.service';
import { OtpType } from '../enums/otp-type.enum';
import {
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  InvalidOtpException,
  OtpExpiredException,
  PasswordMismatchException,
} from 'src/core/exceptions/auth.exception';
import { IAuthResult } from 'src/core/common/interfaces/auth.interface';
import { ApiResponseDto } from 'src/core/dto/api-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: AuthJwtService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) { }

  /**
   * Bước 1: Người dùng nhập email → gửi OTP.
   * Không tạo User. Không nhận password.
   */
  async requestOtp(dto: RequestRegisterOtpDto): Promise<ApiResponseDto<null>> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new EmailAlreadyExistsException();
    }

    const otp = await this.otpService.generateAndSaveOtp(dto.email, OtpType.REGISTER);
    await this.mailService.sendOtpEmail(dto.email, otp);

    return new ApiResponseDto(true, 'Mã OTP đã được gửi đến email của bạn', null);
  }

  /**
   * Bước 1.5: Gửi lại OTP mới, ghi đè OTP cũ, reset TTL.
   */
  async resendOtp(dto: ResendOtpDto): Promise<ApiResponseDto<null>> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Nếu user đã tồn tại -> Đây là luồng Forgot Password. Nếu chưa -> Luồng Register.
    const type = existingUser ? OtpType.FORGOT_PASSWORD : OtpType.REGISTER;

    const newOtp = await this.otpService.resendOtp(dto.email, type);
    await this.mailService.sendOtpEmail(dto.email, newOtp);

    return new ApiResponseDto(true, 'Mã OTP mới đã được gửi đến email của bạn', null);
  }

  /**
   * Bước 2: Người dùng nhập OTP + thông tin đăng ký → tạo tài khoản.
   * Chỉ tạo User sau khi OTP hợp lệ.
   * Password chỉ nhận đúng một lần ở bước này.
   */
  async register(dto: RegisterDto): Promise<IAuthResult> {
    // 1. Validate confirm password
    if (dto.password !== dto.confirmPassword) {
      throw new PasswordMismatchException();
    }

    // 2. Kiểm tra key OTP có tồn tại không (phân biệt hết hạn vs sai mã)
    const otpKeyExists = await this.otpService.hasOtp(dto.email, OtpType.REGISTER);
    if (!otpKeyExists) {
      throw new OtpExpiredException();
    }

    // 3. Verify OTP
    const isOtpValid = await this.otpService.verifyOtp(dto.email, dto.otp, OtpType.REGISTER);
    if (!isOtpValid) {
      throw new InvalidOtpException();
    }

    // 4. Hash password
    const hashedPassword = await this.passwordService.hashPassword(dto.password);

    // 5. Tạo User
    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash: hashedPassword,
        provider: AuthProvider.LOCAL,
        role: Role.USER,
        isActive: true,
      },
    });

    // 6. Generate tokens
    const payload = {
      sub: newUser.id.toString(),
      email: newUser.email,
      role: newUser.role,
    };
    const accessToken = this.jwtService.generateAccessToken(payload);
    const refreshToken = this.jwtService.generateRefreshToken(payload);

    const { passwordHash, ...safeUser } = newUser;

    return {
      accessToken,
      refreshToken,
      user: safeUser,
    };
  }

  /**
   * Login với email + password.
   */
  async login(data: LoginDto): Promise<IAuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (!user || !user.passwordHash) {
      throw new InvalidCredentialsException();
    }

    const isPasswordValid = await this.passwordService.verifyPassword(
      data.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    const payload = {
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.generateAccessToken(payload);
    const refreshToken = this.jwtService.generateRefreshToken(payload);

    const { passwordHash, ...safeUser } = user;

    return {
      accessToken,
      refreshToken,
      user: safeUser,
    };
  }

  /**
   * Quên mật khẩu: Yêu cầu gửi mã OTP
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<ApiResponseDto<null>> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      // Trả về success kể cả khi không có email để bảo mật thông tin
      return new ApiResponseDto(true, 'Nếu email tồn tại, mã OTP đã được gửi.', null);
    }

    const otp = await this.otpService.generateAndSaveOtp(dto.email, OtpType.FORGOT_PASSWORD);

    await this.mailService.sendOtpEmail(dto.email, otp);

    return new ApiResponseDto(true, 'Mã xác nhận đặt lại mật khẩu đã được gửi đến email của bạn.', null);
  }

  /**
   * Quên mật khẩu: Đặt lại mật khẩu mới
   */
  async resetPassword(dto: ResetPasswordDto): Promise<ApiResponseDto<null>> {
    const isOtpValid = await this.otpService.verifyOtp(dto.email, dto.otp, OtpType.FORGOT_PASSWORD);
    if (!isOtpValid) {
      throw new InvalidOtpException();
    }

    const hashedPassword = await this.passwordService.hashPassword(dto.newPassword);

    await this.prisma.user.update({
      where: { email: dto.email },
      data: { passwordHash: hashedPassword },
    });

    return new ApiResponseDto(true, 'Đặt lại mật khẩu thành công.', null);
  }

  /**
   * Login với Google OAuth
   */
  async googleLogin(req: any): Promise<IAuthResult> {
    if (!req.user) {
      throw new InvalidCredentialsException();
    }
    const { email, firstName, lastName, picture } = req.user;

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: `${firstName} ${lastName}`.trim(),
          avatar: picture,
          provider: AuthProvider.GOOGLE,
          role: Role.USER,
          isActive: true,
        },
      });
    }

    const payload = {
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.generateAccessToken(payload);
    const refreshToken = this.jwtService.generateRefreshToken(payload);

    const { passwordHash, ...safeUser } = user;

    return {
      accessToken,
      refreshToken,
      user: safeUser,
    };
  }
}
