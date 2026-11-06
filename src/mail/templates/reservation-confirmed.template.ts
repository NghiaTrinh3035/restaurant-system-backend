export interface ReservationConfirmedEmailData {
  customerName: string;
  reservationCode: string;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  tableName?: string | null;
  floor?: number | null;
  specialNotes?: string | null;
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

export function buildReservationConfirmedEmailTemplate(data: ReservationConfirmedEmailData): string {
  const formattedDate = formatDate(data.reservationDate);
  const hasOrders = data.orders && data.orders.length > 0;
  const totalOrderAmount = hasOrders
    ? data.orders!.reduce((sum, item) => sum + Number(item.subtotal), 0)
    : 0;

  const ordersHtml = hasOrders
    ? `
      <div style="margin-top: 24px; border-top: 1px dashed #e2e8f0; pt-4">
        <h3 style="margin: 16px 0 12px; color: #1e293b; font-size: 15px; font-weight: 700;">
          📋 Món ăn đặt trước (${data.orders!.length} món):
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

  const tableInfo = data.tableName
    ? `Bàn ${data.tableName}${data.floor ? ` · Tầng ${data.floor}` : ''}`
    : 'Nhà hàng sẽ sắp xếp khi quý khách đến';

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Xác nhận đặt bàn thành công</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
  <div style="width: 100%; background-color: #f1f5f9; padding: 40px 12px; box-sizing: border-box;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
      
      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #ea580c, #f97316); padding: 36px 28px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">FoodHub Restaurant</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">Xác nhận đặt bàn thành công</p>
      </div>

      <!-- MAIN CONTENT -->
      <div style="padding: 32px 28px;">
        <p style="font-size: 15px; color: #334155; margin: 0 0 16px;">
          Xin chào <strong>${data.customerName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          Yêu cầu đặt bàn của quý khách đã được nhân viên nhà hàng <strong>xác nhận thành công</strong>. Dưới đây là thông tin chi tiết về lịch hẹn:
        </p>

        <!-- CODE BOX -->
        <div style="background-color: #fff7ed; border: 2px dashed #fdba74; border-radius: 12px; padding: 18px 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 12px; text-transform: uppercase; color: #c2410c; font-weight: 700; letter-spacing: 1px;">Mã đặt bàn của quý khách</span>
          <div style="font-size: 26px; font-weight: 900; color: #ea580c; font-family: monospace; letter-spacing: 2px; margin-top: 4px;">
            ${data.reservationCode}
          </div>
          <p style="margin: 4px 0 0; font-size: 12px; color: #7c2d12;">Vui lòng cung cấp mã này khi tới quầy lễ tân chi nhánh</p>
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
            <td style="padding: 10px 0; color: #64748b;">Thời gian dùng bữa:</td>
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
          ${
            data.specialNotes
              ? `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">Ghi chú đặc biệt:</td>
            <td style="padding: 10px 0; color: #475569; font-style: italic;">"${data.specialNotes}"</td>
          </tr>
          `
              : ''
          }
        </table>

        <!-- PRE-ORDERED ITEMS (IF ANY) -->
        ${ordersHtml}

        <!-- INSTRUCTION ALERT -->
        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 8px; margin-top: 24px;">
          <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: 700; color: #15803d;">💡 Lưu ý quan trọng khi đến nhà hàng:</h4>
          <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: #166534; line-height: 1.6;">
            <li>Quý khách vui lòng có mặt trước giờ hẹn từ <strong>5 - 10 phút</strong>.</li>
            <li>Bàn sẽ được giữ tối đa <strong>15 phút</strong> so với giờ hẹn. Sau thời gian này nếu quý khách chưa đến, bàn có thể được tự động giải phóng.</li>
            <li>Nếu có thay đổi về thời gian hoặc số lượng khách, xin vui lòng liên hệ sớm hotline chi nhánh để được hỗ trợ tốt nhất.</li>
          </ul>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0 0 6px; font-weight: 600; color: #64748b;">Hệ thống nhà hàng FoodHub</p>
        <p style="margin: 0 0 8px;">Cảm ơn quý khách đã tin tưởng và đồng hành cùng FoodHub!</p>
        <p style="margin: 0; font-size: 11px;">Email này được gửi tự động từ hệ thống. Quý khách vui lòng không phản hồi trực tiếp email này.</p>
      </div>

    </div>
  </div>
</body>
</html>
  `.trim();
}

