import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { buildOtpEmailTemplate } from './templates/otp.template';

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
   * Gửi email chứa mã OTP xác thực đăng ký và quên mật khẩu.
   */
  async sendOtpEmail(to: string, otp: string): Promise<void> {
    const from = this.configService.get<string>('MAIL_FROM');
    const html = buildOtpEmailTemplate(otp);

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: '🔐 Mã xác thực OTP — Restaurant Reservation System',
        html,
      });
      this.logger.log(`OTP email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error);
      throw error;
    }
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
