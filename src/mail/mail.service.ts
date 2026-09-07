import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { buildOtpEmailTemplate } from './templates/otp.template';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  type?: string;
  data?: Record<string, any>;
  senderName?: string;
}

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      secure: false, // STARTTLS on port 587
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  /**
   * Phương thức điều phối gửi email tập trung cho toàn bộ ứng dụng:
   * - Nếu NODE_ENV === 'development': gửi qua SMTP Nodemailer trực tiếp.
   * - Nếu NODE_ENV !== 'development' (Production / Staging / Render): gửi qua Google Apps Script Webhook.
   *   (Backend tự sinh HTML chuẩn và gửi sang GAS để GmailApp phát đi -> đảm bảo 100% đồng nhất giao diện).
   * - Nếu chạy ở dev nhưng SMTP lỗi: tự động kích hoạt fallback sang GAS nếu có cấu hình GOOGLE_APPS_SCRIPT_URL.
   */
  async sendMail(options: SendMailOptions): Promise<void> {
    const isDev = this.configService.get<string>('NODE_ENV') === 'development';
    const gasUrl = this.configService.get<string>('GOOGLE_APPS_SCRIPT_URL');
    const type = options.type !== undefined ? options.type : 'CUSTOM';

    // 1. Production / Non-development: Gửi qua Google Apps Script Webhook
    if (!isDev && gasUrl) {
      this.logger.log(`[Production/Render] Gửi email [${type}] tới ${options.to} qua Google Apps Script Webhook...`);
      await this.sendViaGoogleAppsScript(options, gasUrl);
      return;
    }

    // 2. Development: Gửi qua SMTP Nodemailer
    try {
      const from = this.configService.getOrThrow<string>('MAIL_FROM');
      await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`[Development] Đã gửi email [${type}] thành công tới ${options.to} qua SMTP`);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi gửi mail qua SMTP tới ${options.to}: ${errorMessage}`);

      // Fallback: Nếu SMTP thất bại và có cấu hình GAS URL, chuyển hướng dự phòng sang GAS
      if (gasUrl) {
        this.logger.warn(`[Fallback] Kích hoạt phương thức dự phòng gửi email [${type}] tới ${options.to} qua Google Apps Script...`);
        try {
          await this.sendViaGoogleAppsScript(options, gasUrl);
          return;
        } catch (gasError) {
          this.logger.error(`[Fallback Error] Cả SMTP và Google Apps Script đều thất bại cho ${options.to}`, gasError);
        }
      }

      throw error;
    }
  }

  /**
   * Gửi request tới Google Apps Script Webhook
   */
  private async sendViaGoogleAppsScript(options: SendMailOptions, gasUrl: string): Promise<void> {
    const type = options.type !== undefined ? options.type : 'CUSTOM';
    try {
      const mailFrom = this.configService.get<string>('MAIL_FROM');
      let senderName = options.senderName;
      if (!senderName && mailFrom) {
        senderName = mailFrom.replace(/<.*>/, '').replace(/"/g, '').trim();
      }

      const payload = {
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(senderName ? { senderName } : {}),
      };

      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Google Apps Script trả về mã HTTP ${response.status}: ${response.statusText}`);
      }

      const result: any = await response.json().catch(async () => {
        const text = await response.text();
        return { message: text };
      });

      if (result && result.success === false) {
        const errDetail = result.message ? result.message : 'Lỗi không xác định từ GAS';
        throw new Error(`Google Apps Script báo lỗi: ${errDetail}`);
      }

      this.logger.log(`Đã gửi email [${type}] thành công tới ${options.to} qua Google Apps Script Webhook!`);
    } catch (error) {
      this.logger.error(`Lỗi khi gọi Google Apps Script Webhook cho ${options.to}:`, error);
      throw error;
    }
  }

  /**
   * Gửi email OTP xác thực tài khoản / quên mật khẩu.
   */
  async sendOtpEmail(to: string, otp: string): Promise<void> {
    const subject = '🔐 Mã xác thực OTP — Restaurant Reservation System';
    const html = buildOtpEmailTemplate(otp);

    await this.sendMail({
      to,
      subject,
      html,
      type: 'OTP',
      data: { otp },
    });
  }

  /**
   * Gửi email xác nhận đặt bàn.
   * @todo Implement khi có tính năng Reservation.
   */
  async sendReservationEmail(
    _to: string,
    _reservationDetails: Record<string, unknown>,
  ): Promise<void> {
    // TODO: implement when Reservation Confirmation feature is ready
    throw new Error('sendReservationEmail is not implemented yet');
  }

  /**
   * Gửi email xác nhận thanh toán.
   * @todo Implement khi có tính năng Payment.
   */
  async sendPaymentEmail(
    _to: string,
    _paymentDetails: Record<string, unknown>,
  ): Promise<void> {
    // TODO: implement when Payment Confirmation feature is ready
    throw new Error('sendPaymentEmail is not implemented yet');
  }
}
