import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { OtpType } from '../enums/otp-type.enum';

const OTP_TTL_SECONDS = 5 * 60; // 5 phút
const MAX_OTP_ATTEMPTS = 5; // Tối đa 5 lần nhập sai trước khi khóa mã OTP

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  // 1. Hàm tạo key động dựa trên Enum
  private getRedisKey(email: string, type: OtpType): string {
    return `otp:${type.toLowerCase()}:${email}`;
  }

  // 1.1 Hàm tạo key đếm số lần nhập sai
  private getAttemptsKey(email: string, type: OtpType): string {
    return `otp_attempts:${type.toLowerCase()}:${email}`;
  }

  // 2. Hàm sinh OTP và tự động lưu vào Redis
  async generateAndSaveOtp(email: string, type: OtpType): Promise<string> {
    // Sinh OTP ngẫu nhiên an toàn bằng crypto (6 chữ số từ 100000 đến 999999)
    const otp = crypto.randomInt(100000, 1000000).toString();
    const redisKey = this.getRedisKey(email, type);
    const attemptsKey = this.getAttemptsKey(email, type);
    
    // Lưu vào Redis với TTL = 300 giây (5 phút)
    await this.redisClient.set(redisKey, otp, 'EX', OTP_TTL_SECONDS);
    // Xóa bộ đếm nhập sai cũ nếu có
    await this.redisClient.del(attemptsKey);

    this.logger.log(`OTP generated securely for ${email} (TTL: ${OTP_TTL_SECONDS}s)`); 
    return otp;
  }

  // 3. Hàm kiểm tra tính hợp lệ của OTP kèm chống brute-force
  async verifyOtp(email: string, otp: string, type: OtpType): Promise<boolean> {
    const redisKey = this.getRedisKey(email, type);
    const attemptsKey = this.getAttemptsKey(email, type);

    // Kiểm tra số lần nhập sai trước đó
    const attempts = await this.redisClient.get(attemptsKey);
    if (attempts && parseInt(attempts, 10) >= MAX_OTP_ATTEMPTS) {
      this.logger.warn(`OTP brute-force attempt exceeded for ${email}. Invalidating OTP.`);
      await this.redisClient.del(redisKey);
      await this.redisClient.del(attemptsKey);
      return false;
    }

    const storedOtp = await this.redisClient.get(redisKey);

    if (storedOtp && storedOtp === otp) {
      // Xóa OTP và bộ đếm sau khi xác thực thành công
      await this.redisClient.del(redisKey);
      await this.redisClient.del(attemptsKey);
      return true;
    }

    // Tăng số lần thử sai
    const currentAttempts = await this.redisClient.incr(attemptsKey);
    await this.redisClient.expire(attemptsKey, OTP_TTL_SECONDS);

    if (currentAttempts >= MAX_OTP_ATTEMPTS) {
      this.logger.warn(`Max OTP attempts reached for ${email}. Key invalidated.`);
      await this.redisClient.del(redisKey);
    }

    return false;
  }

  // 4. Hàm xóa OTP cũ (Dùng cho tính năng Resend OTP)
  async clearOtp(email: string, type: OtpType): Promise<void> {
    const redisKey = this.getRedisKey(email, type);
    const attemptsKey = this.getAttemptsKey(email, type);

    await this.redisClient.del(redisKey);
    await this.redisClient.del(attemptsKey);
    this.logger.log(`OTP cleared for ${email}`);
  }

  // 5. Hàm gửi lại OTP
  async resendOtp(email: string, type: OtpType): Promise<string> {
    await this.clearOtp(email, type);
    return this.generateAndSaveOtp(email, type);
  }

  // 6. Hàm kiểm tra key OTP có tồn tại trong Redis không (bất kể giá trị).
  async hasOtp(email: string, type: OtpType): Promise<boolean> {
    const redisKey = this.getRedisKey(email, type);
    const exists = await this.redisClient.exists(redisKey);
    return exists === 1;
  }
}