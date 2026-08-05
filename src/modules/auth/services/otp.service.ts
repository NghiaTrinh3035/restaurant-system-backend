import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';

const OTP_TTL_SECONDS = 5 * 60; // 5 phút

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  /**
   * Sinh ngẫu nhiên mã OTP 6 chữ số.
   */
  generateOtp(): string {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    return otp;
  }

  /**
   * Lưu OTP vào Redis với TTL 5 phút.
   * Key: otp:register:{email}
   * Value: JSON { otp: "123456" }
   */
  async saveOtp(email: string, otp: string): Promise<void> {
    const key = this.buildKey(email);
    const value = JSON.stringify({ otp });
    await this.redisClient.set(key, value, 'EX', OTP_TTL_SECONDS);
    this.logger.log(`OTP saved for ${email} (TTL: ${OTP_TTL_SECONDS}s)`);
  }

  /**
   * Xác minh OTP. So sánh với giá trị trong Redis.
   * Trả về true nếu hợp lệ, false nếu sai hoặc đã hết hạn.
   */
  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const key = this.buildKey(email);
    const raw = await this.redisClient.get(key);

    if (!raw) {
      return false; // OTP không tồn tại hoặc đã hết hạn
    }

    const parsed = JSON.parse(raw) as { otp: string };
    return parsed.otp === otp;
  }

  /**
   * Xóa OTP khỏi Redis sau khi xác thực thành công.
   */
  async deleteOtp(email: string): Promise<void> {
    const key = this.buildKey(email);
    await this.redisClient.del(key);
    this.logger.log(`OTP deleted for ${email}`);
  }

  /**
   * Sinh OTP mới, ghi đè OTP cũ và reset TTL về 5 phút.
   * Trả về OTP mới để caller có thể gửi email.
   */
  async resendOtp(email: string): Promise<string> {
    const newOtp = this.generateOtp();
    await this.saveOtp(email, newOtp); // ghi đè + reset TTL
    this.logger.log(`OTP resent for ${email}`);
    return newOtp;
  }

  /**
   * Kiểm tra key OTP có tồn tại trong Redis không (bất kể giá trị).
   * Dùng để phân biệt "OTP hết hạn" vs "OTP sai".
   */
  async hasOtp(email: string): Promise<boolean> {
    const key = this.buildKey(email);
    const exists = await this.redisClient.exists(key);
    return exists === 1;
  }

  private buildKey(email: string): string {
    return `otp:register:${email}`;
  }
}
