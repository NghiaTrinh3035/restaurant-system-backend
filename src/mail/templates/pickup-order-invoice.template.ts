export interface PickupOrderInvoiceEmailData {
  customerName: string;
  orderCode: string;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  pickupDate: string;
  pickupTime: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    note?: string | null;
  }>;
  totalAmount: number;
  specialNotes?: string | null;
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

export function buildPickupOrderInvoiceEmailTemplate(data: PickupOrderInvoiceEmailData): string {
  const formattedDate = formatDate(data.pickupDate);

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hóa đơn & Xác nhận đơn hàng mang về</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
  <div style="width: 100%; background-color: #f1f5f9; padding: 40px 12px; box-sizing: border-box;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
      
      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #ea580c, #f97316); padding: 36px 28px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">FoodHub Restaurant</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">Hóa đơn & Xác nhận đơn mang về (Takeaway)</p>
      </div>

      <!-- MAIN CONTENT -->
      <div style="padding: 32px 28px;">
        <p style="font-size: 15px; color: #334155; margin: 0 0 16px;">
          Xin chào <strong>${data.customerName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          Đơn hàng mang về của quý khách đã được tạo thành công! Nhà bếp chi nhánh sẽ chuẩn bị các món ăn nóng hổi và đóng gói cẩn thận đúng theo lịch hẹn của quý khách.
        </p>

        <!-- CODE BOX -->
        <div style="background-color: #fff7ed; border: 2px dashed #fdba74; border-radius: 12px; padding: 18px 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 12px; text-transform: uppercase; color: #c2410c; font-weight: 700; letter-spacing: 1px;">Mã nhận hàng của quý khách</span>
          <div style="font-size: 28px; font-weight: 900; color: #ea580c; font-family: monospace; letter-spacing: 2px; margin-top: 4px;">
            ${data.orderCode}
          </div>
          <p style="margin: 4px 0 0; font-size: 12px; color: #7c2d12;">Đọc hoặc xuất trình mã này tại quầy mang về để nhận món</p>
        </div>

        <!-- DETAILS INFO -->
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; width: 38%;">Chi nhánh lấy món:</td>
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
            <td style="padding: 10px 0; color: #64748b;">Thời gian hẹn lấy:</td>
            <td style="padding: 10px 0; color: #ea580c; font-weight: 700;">${data.pickupTime} · Ngày ${formattedDate}</td>
          </tr>
          ${
            data.specialNotes
              ? `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">Ghi chú đơn hàng:</td>
            <td style="padding: 10px 0; color: #475569; font-style: italic;">"${data.specialNotes}"</td>
          </tr>
          `
              : ''
          }
        </table>

        <!-- ITEMS INVOICE TABLE -->
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
          <div style="background-color: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #334155; font-size: 14px;">
            🧾 Chi tiết hóa đơn món ăn
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b; text-align: left; background-color: #ffffff;">
                <th style="padding: 10px 14px; font-weight: 600;">Món ăn</th>
                <th style="padding: 10px 8px; font-weight: 600; text-align: center;">SL</th>
                <th style="padding: 10px 8px; font-weight: 600; text-align: right;">Đơn giá</th>
                <th style="padding: 10px 14px; font-weight: 600; text-align: right;">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${data.items
                .map(
                  (item) => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 12px 14px; color: #0f172a; font-weight: 500;">
                    <div>${item.name}</div>
                    ${item.note ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 2px;">Ghi chú: ${item.note}</div>` : ''}
                  </td>
                  <td style="padding: 12px 8px; text-align: center; color: #475569; font-weight: 600;">x${item.quantity}</td>
                  <td style="padding: 12px 8px; text-align: right; color: #64748b;">${formatCurrency(Number(item.unitPrice))}</td>
                  <td style="padding: 12px 14px; text-align: right; color: #0f172a; font-weight: 600;">${formatCurrency(Number(item.subtotal))}</td>
                </tr>
              `,
                )
                .join('')}
              <tr style="background-color: #f8fafc; font-weight: 800;">
                <td colspan="3" style="padding: 14px 14px; text-align: right; color: #1e293b; font-size: 14px;">TỔNG TIỀN THANH TOÁN:</td>
                <td style="padding: 14px 14px; text-align: right; color: #ea580c; font-size: 16px;">${formatCurrency(Number(data.totalAmount))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- REMINDER ALERT -->
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 8px;">
          <h4 style="margin: 0 0 6px; font-size: 13px; font-weight: 700; color: #1d4ed8;">🔔 Lời nhắc nhận món:</h4>
          <p style="margin: 0; font-size: 12.5px; color: #1e40af; line-height: 1.6;">
            Khi nhà bếp chuẩn bị xong món ăn, hệ thống sẽ gửi thêm một email thông báo đến quý khách. Quý khách vui lòng ghé quầy mang về của chi nhánh đúng giờ hẹn để nhận món được ngon nhất!
          </p>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0 0 6px; font-weight: 600; color: #64748b;">Hệ thống nhà hàng FoodHub</p>
        <p style="margin: 0 0 8px;">Cảm ơn quý khách đã đặt món tại FoodHub!</p>
        <p style="margin: 0; font-size: 11px;">Email này được gửi tự động từ hệ thống. Quý khách vui lòng không phản hồi trực tiếp email này.</p>
      </div>

    </div>
  </div>
</body>
</html>
  `.trim();
}

