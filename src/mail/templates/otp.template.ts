export function buildOtpEmailTemplate(otp: string): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mã xác thực OTP</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f4f7;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    .wrapper {
      width: 100%;
      padding: 40px 16px;
      background-color: #f4f4f7;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    }
    .header {
      background: linear-gradient(135deg, #b91c1c, #dc2626);
      padding: 36px 32px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .header p {
      margin: 6px 0 0;
      color: rgba(255,255,255,0.85);
      font-size: 13px;
    }
    .body {
      padding: 36px 32px;
      text-align: center;
    }
    .body p.intro {
      color: #374151;
      font-size: 15px;
      margin: 0 0 28px;
      line-height: 1.6;
    }
    .otp-box {
      display: inline-block;
      background-color: #fef2f2;
      border: 2px dashed #dc2626;
      border-radius: 12px;
      padding: 20px 40px;
      margin-bottom: 28px;
    }
    .otp-code {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: 12px;
      color: #b91c1c;
      margin: 0;
      font-family: 'Courier New', monospace;
    }
    .expiry-note {
      color: #6b7280;
      font-size: 13px;
      margin: 0 0 8px;
    }
    .warning {
      color: #9ca3af;
      font-size: 12px;
      margin: 0;
    }
    .footer {
      background-color: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 20px 32px;
      text-align: center;
    }
    .footer p {
      color: #9ca3af;
      font-size: 12px;
      margin: 0;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>🍽️ Restaurant Reservation System</h1>
        <p>Xác thực tài khoản của bạn</p>
      </div>
      <div class="body">
        <p class="intro">
          Đây là mã xác thực OTP để hoàn tất đăng ký tài khoản của bạn.
          Vui lòng nhập mã bên dưới vào ứng dụng.
        </p>
        <div class="otp-box">
          <p class="otp-code">${otp}</p>
        </div>
        <p class="expiry-note">⏱ Mã có hiệu lực trong <strong>5 phút</strong>.</p>
        <p class="warning">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
      </div>
      <div class="footer">
        <p>© 2025 Restaurant Reservation System. All rights reserved.</p>
        <p>Email này được gửi tự động, vui lòng không trả lời.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
