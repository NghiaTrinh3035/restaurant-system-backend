import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';
import { OtpType } from '../enums/otp-type.enum';

const OTP_TTL_SECONDS = 5 * 60; // 5 phút

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

  // 2. Hàm sinh OTP và tự động lưu vào Redis
  async generateAndSaveOtp(email: string, type: OtpType): Promise<string> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Sinh OTP 6 số
    const redisKey = this.getRedisKey(email, type);
    
    // Lưu vào Redis với TTL = 300 giây (5 phút)
    await this.redisClient.set(redisKey, otp, 'EX', OTP_TTL_SECONDS);
    this.logger.log(`OTP saved for ${email} (TTL: ${OTP_TTL_SECONDS}s)`); 
    return otp;
  }

  // 3. Hàm kiểm tra tính hợp lệ của OTP
  async verifyOtp(email: string, otp: string, type: OtpType): Promise<boolean> {
    const redisKey = this.getRedisKey(email, type);
    const storedOtp = await this.redisClient.get(redisKey);

    if (storedOtp && storedOtp === otp) {
      await this.redisClient.del(redisKey); // Xóa OTP sau khi xác thực thành công
      return true;
    }
    return false;
  }

  // 4. Hàm xóa OTP cũ (Dùng cho tính năng Resend OTP)
  async clearOtp(email: string, type: OtpType): Promise<void> {
    const redisKey = this.getRedisKey(email, type);
    await this.redisClient.del(redisKey);
    this.logger.log(`OTP deleted for ${email}`);
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