export interface PickupOrderPreparingEmailData {
  customerName: string;
  orderCode: string;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  pickupDate: string;
  pickupTime: string;
  itemCount: number;
  items?: Array<{
    name: string;
    quantity: number;
  }>;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function buildPickupOrderPreparingEmailTemplate(
  data: PickupOrderPreparingEmailData,
): string {
  const formattedDate = formatDate(data.pickupDate);
  const itemsPreview =
    data.items && data.items.length > 0
      ? data.items
          .map(
            (i) =>
              `<li style="margin: 4px 0; color: #334155;"><strong>${i.quantity}x</strong> ${i.name}</li>`,
          )
          .join('')
      : '';

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bếp đang chuẩn bị món mang về cho bạn</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
  <div style="width: 100%; background-color: #f1f5f9; padding: 40px 12px; box-sizing: border-box;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
      
      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #7c3aed, #ea580c); padding: 36px 28px; text-align: center; color: #ffffff;">
        <div style="font-size: 38px; margin-bottom: 8px;">👨‍🍳</div>
        <h1 style="margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -0.5px;">Bếp đang chuẩn bị món cho bạn!</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">Đơn mang về của quý khách đang được chế biến và sắp hoàn tất</p>
      </div>

      <!-- MAIN CONTENT -->
      <div style="padding: 32px 28px;">
        <p style="font-size: 15px; color: #334155; margin: 0 0 16px;">
          Xin chào <strong>${data.customerName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          Đầu bếp tại chi nhánh <strong>${data.branchName}</strong> đã bắt đầu chế biến đơn hàng gồm <strong>${data.itemCount} món</strong> của quý khách. Sắp có món nóng hổi để quý khách ghé lấy theo lịch hẹn!
        </p>

        <div style="background-color: #faf5ff; border: 2px dashed #c084fc; border-radius: 12px; padding: 18px 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 12px; text-transform: uppercase; color: #7e22ce; font-weight: 700; letter-spacing: 1px;">Mã đơn hàng mang về</span>
          <div style="font-size: 28px; font-weight: 900; color: #7c3aed; font-family: monospace; letter-spacing: 2px; margin-top: 6px;">
            ${data.orderCode}
          </div>
          <p style="margin: 6px 0 0; font-size: 13px; color: #6b21a8; font-weight: 600;">
            Giờ hẹn đến lấy: ${data.pickupTime} · Ngày ${formattedDate}
          </p>
        </div>

        ${
          itemsPreview
            ? `
        <div style="background-color: #f8fafc; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #1e293b;">Danh sách món đang chế biến:</p>
          <ul style="margin: 0; padding-left: 18px; font-size: 13px;">
            ${itemsPreview}
          </ul>
        </div>
        `
            : ''
        }

        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; width: 38%;">Chi nhánh:</td>
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

        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 8px;">
          <p style="margin: 0; font-size: 12.5px; color: #166534; line-height: 1.6;">
            Ngay khi bếp đóng gói hoàn tất, FoodHub sẽ gửi thêm thông báo tức thì và email nhắc quý khách tới nhận món.
          </p>
        </div>
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
