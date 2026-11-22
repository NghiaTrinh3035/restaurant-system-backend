export interface ReservationReminderEmailData {
  customerName: string;
  reservationCode: string;
  branchId?: string | null;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  tableName?: string | null;
  floor?: number | null;
  specialNotes?: string | null;
  qrImageUrl?: string | null;
  appPublicUrl?: string | null;
  orders?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
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

export function buildReservationReminderEmailTemplate(data: ReservationReminderEmailData): string {
  const formattedDate = formatDate(data.reservationDate);
  const hasOrders = data.orders && data.orders.length > 0;
  const totalOrderAmount = hasOrders
    ? data.orders!.reduce((sum, item) => sum + Number(item.subtotal), 0)
    : 0;

  const tableInfo = data.tableName
    ? `Bàn ${data.tableName}${data.floor ? ` · Tầng ${data.floor}` : ''}`
    : 'Nhà hàng sẽ sắp xếp khi quý khách đến';

  const ordersHtml = hasOrders
    ? `
      <div style="margin-top: 24px; border-top: 1px dashed #e2e8f0;">
        <h3 style="margin: 16px 0 12px; color: #1e293b; font-size: 15px; font-weight: 700;">
          📋 Món ăn đã đặt trước (${data.orders!.length} món):
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #64748b; text-align: left;">
              <th style="padding: 10px 8px; font-weight: 600;">Món ăn</th>
              <th style="padding: 10px 8px; font-weight: 600; text-align: center;">SL</th>
              <th style="padding: 10px 8px; font-weight: 600; text-align: right;">Đơn giá</th>
              <th style="padding: 10px 8px; font-weight: 600; text-align: right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${data.orders!
              .map(
                (item) => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 8px; color: #1e293b; font-weight: 500;">${item.name}</td>
                <td style="padding: 10px 8px; text-align: center; color: #475569;">x${item.quantity}</td>
                <td style="padding: 10px 8px; text-align: right; color: #64748b;">${formatCurrency(Number(item.unitPrice))}</td>
                <td style="padding: 10px 8px; text-align: right; color: #0f172a; font-weight: 600;">${formatCurrency(Number(item.subtotal))}</td>
              </tr>
            `,
              )
              .join('')}
            <tr style="background-color: #f8fafc; font-weight: 700;">
              <td colspan="3" style="padding: 12px 8px; text-align: right; color: #334155;">Tổng tiền món đặt trước:</td>
              <td style="padding: 12px 8px; text-align: right; color: #ea580c; font-size: 14px;">${formatCurrency(totalOrderAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `
    : '';

  const viewUrl = data.appPublicUrl
    ? `${data.appPublicUrl.replace(/\/+$/, '')}/profile?tab=reservations`
    : null;

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nhắc nhở lịch hẹn dùng bữa tại FoodHub</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
  <div style="width: 100%; background-color: #f1f5f9; padding: 40px 12px; box-sizing: border-box;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
      
      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #0284c7, #ea580c); padding: 36px 28px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">FoodHub Restaurant</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">⏰ Nhắc nhở lịch hẹn dùng bữa sắp tới</p>
      </div>

      <!-- MAIN CONTENT -->
      <div style="padding: 32px 28px;">
        <p style="font-size: 15px; color: #334155; margin: 0 0 16px;">
          Xin chào <strong>${data.customerName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          FoodHub xin nhắc quý khách có lịch hẹn dùng bữa tại <strong>${data.branchName}</strong> vào lúc <strong style="color: #ea580c;">${data.reservationTime} hôm nay (${formattedDate})</strong>. Chúng tôi đã sẵn sàng chào đón quý khách!
        </p>

        <!-- CODE & QR BOX -->
        <div style="background-color: #fff7ed; border: 2px dashed #fdba74; border-radius: 12px; padding: 20px 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 12px; text-transform: uppercase; color: #c2410c; font-weight: 700; letter-spacing: 1px;">Mã đặt bàn & QR Check-in</span>
          <div style="font-size: 26px; font-weight: 900; color: #ea580c; font-family: monospace; letter-spacing: 2px; margin-top: 4px;">
            ${data.reservationCode}
          </div>
          ${
            data.qrImageUrl
              ? `
          <div style="margin: 16px auto 10px; display: inline-block; background-color: #ffffff; padding: 12px; border-radius: 12px; border: 1px solid #fed7aa; box-shadow: 0 2px 8px rgba(234, 88, 12, 0.08);">
            <img src="${data.qrImageUrl}" alt="Mã QR Check-in ${data.reservationCode}" width="180" height="180" style="display: block; width: 180px; height: 180px; border: 0;" />
          </div>
          `
              : ''
          }
          <p style="margin: 4px 0 0; font-size: 12px; color: #7c2d12;">Đưa mã QR này tại quầy lễ tân khi đến nhà hàng để check-in ngay</p>
        </div>

        <!-- DETAILS TABLE -->
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; width: 38%;">Chi nhánh:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${data.branchName}</td>
          </tr>
          ${
            data.branchAddress
              ? `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">Địa chỉ chi nhánh:</td>
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
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">Thời gian hẹn:</td>
            <td style="padding: 10px 0; color: #ea580c; font-weight: 700;">${data.reservationTime} · Ngày ${formattedDate}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">Số lượng khách:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${data.guestCount} người</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">Vị trí bàn:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${tableInfo}</td>
          </tr>
        </table>

        ${ordersHtml}

        ${
          viewUrl
            ? `
        <div style="text-align: center; margin-top: 24px;">
          <a href="${viewUrl}" style="display: inline-block; background-color: #ea580c; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 10px;">
            Xem chi tiết lịch đặt bàn
          </a>
        </div>
        `
            : ''
        }

        <!-- INSTRUCTION ALERT -->
        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 8px; margin-top: 24px;">
          <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: 700; color: #15803d;">💡 Lưu ý trước giờ dùng bữa:</h4>
          <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: #166534; line-height: 1.6;">
            <li>Quý khách vui lòng có mặt trước giờ hẹn từ <strong>5 - 10 phút</strong>.</li>
            <li>Bàn sẽ được giữ tối đa <strong>15 phút</strong> so với giờ hẹn.</li>
            <li>Nếu có thay đổi đột xuất về kế hoạch, quý khách vui lòng cập nhật trên website hoặc liên hệ hotline chi nhánh.</li>
          </ul>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0 0 6px; font-weight: 600; color: #64748b;">Hệ thống nhà hàng FoodHub</p>
        <p style="margin: 0 0 8px;">Hẹn gặp quý khách tại nhà hàng!</p>
        <p style="margin: 0; font-size: 11px;">Email này được gửi tự động từ hệ thống. Quý khách vui lòng không phản hồi trực tiếp email này.</p>
      </div>

    </div>
  </div>
</body>
</html>
  `.trim();
}
