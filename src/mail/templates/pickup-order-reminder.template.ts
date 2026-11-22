export interface PickupOrderReminderEmailData {
  customerName: string;
  orderCode: string;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  pickupDate: string;
  pickupTime: string;
  totalAmount: number;
  itemCount: number;
  appPublicUrl?: string | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function buildPickupOrderReminderEmailTemplate(
  data: PickupOrderReminderEmailData,
): string {
  const formattedDate = formatDate(data.pickupDate);
  const viewUrl = data.appPublicUrl
    ? `${data.appPublicUrl.replace(/\/+$/, '')}/profile?tab=pickup-orders`
    : null;

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nhắc lịch hẹn đến lấy món mang về</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
  <div style="width: 100%; background-color: #f1f5f9; padding: 40px 12px; box-sizing: border-box;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
      
      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #f59e0b, #ea580c); padding: 36px 28px; text-align: center; color: #ffffff;">
        <div style="font-size: 38px; margin-bottom: 8px;">⏰</div>
        <h1 style="margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -0.5px;">Sắp đến giờ ghé lấy món!</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">FoodHub nhắc lịch hẹn nhận đơn mang về tại chi nhánh</p>
      </div>

      <!-- MAIN CONTENT -->
      <div style="padding: 32px 28px;">
        <p style="font-size: 15px; color: #334155; margin: 0 0 16px;">
          Xin chào <strong>${data.customerName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          Quý khách có lịch hẹn đến nhận đơn hàng mang về (${data.itemCount} món) tại chi nhánh <strong>${data.branchName}</strong> vào lúc <strong style="color: #ea580c;">${data.pickupTime} ngày ${formattedDate}</strong>.
        </p>

        <div style="background-color: #fff7ed; border: 2px dashed #fdba74; border-radius: 12px; padding: 20px 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 12px; text-transform: uppercase; color: #c2410c; font-weight: 700; letter-spacing: 1px;">Mã nhận hàng tại quầy</span>
          <div style="font-size: 30px; font-weight: 900; color: #ea580c; font-family: monospace; letter-spacing: 2px; margin-top: 6px;">
            ${data.orderCode}
          </div>
          <p style="margin: 6px 0 0; font-size: 13px; color: #9a3412; font-weight: 600;">
            Tổng giá trị đơn: ${formatCurrency(Number(data.totalAmount))}
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; width: 38%;">Chi nhánh lấy món:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${data.branchName}</td>
          </tr>
          ${
            data.branchAddress
              ? `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">Địa chỉ:</td>
            <td style="padding: 10px 0; color: #0f172a;">${data.branchAddress}</td>
          </tr>
          `
              : ''
          }
          ${
            data.branchPhone
              ? `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">Hotline chi nhánh:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${data.branchPhone}</td>
          </tr>
          `
              : ''
          }
        </table>

        ${
          viewUrl
            ? `
        <div style="text-align: center; margin-top: 20px;">
          <a href="${viewUrl}" style="display: inline-block; background-color: #ea580c; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 10px;">
            Xem mã QR nhận món
          </a>
        </div>
        `
            : ''
        }
      </div>

      <!-- FOOTER -->
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0 0 6px; font-weight: 600; color: #64748b;">Hệ thống nhà hàng FoodHub</p>
        <p style="margin: 0; font-size: 11px;">Email này được gửi tự động từ hệ thống. Quý khách vui lòng không phản hồi trực tiếp email này.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
