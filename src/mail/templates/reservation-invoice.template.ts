export interface ReservationInvoiceEmailData {
  customerName: string;
  reservationCode: string;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  reservationDate: string;
  reservationTime: string;
  tableName?: string | null;
  floor?: number | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  totalFoodAmount: number;
  depositAmount: number;
  settlementAmount: number;
  paymentMethod: string;
  transactionCode?: string | null;
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

export function buildReservationInvoiceEmailTemplate(data: ReservationInvoiceEmailData): string {
  const formattedDate = formatDate(data.reservationDate);

  const itemsHtml = data.items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 8px; color: #1e293b; font-weight: 500;">${item.name}</td>
        <td style="padding: 10px 8px; color: #475569; text-align: center;">x${item.quantity}</td>
        <td style="padding: 10px 8px; color: #475569; text-align: right;">${formatCurrency(item.unitPrice)}</td>
        <td style="padding: 10px 8px; color: #0f172a; font-weight: 600; text-align: right;">${formatCurrency(item.subtotal)}</td>
      </tr>
    `,
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hóa đơn thanh toán bữa ăn</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
  <div style="width: 100%; background-color: #f1f5f9; padding: 40px 12px; box-sizing: border-box;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
      
      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 36px 28px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">FoodHub Restaurant</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">Hóa đơn quyết toán bữa ăn tại bàn</p>
      </div>

      <!-- MAIN CONTENT -->
      <div style="padding: 32px 28px;">
        <p style="font-size: 15px; color: #334155; margin: 0 0 16px;">
          Xin chào <strong>${data.customerName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          Cảm ơn quý khách đã dùng bữa tại nhà hàng <strong>${data.branchName}</strong>. Bữa ăn của quý khách đã được quyết toán thành công. Dưới đây là bảng kê chi tiết hóa đơn thanh toán:
        </p>

        <!-- INFO BOX -->
        <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; width: 40%;">Mã đặt bàn:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 700; font-family: monospace; font-size: 14px;">#${data.reservationCode}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Chi nhánh:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${data.branchName}</td>
            </tr>
            ${data.branchAddress ? `
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Địa chỉ:</td>
              <td style="padding: 6px 0; color: #334155;">${data.branchAddress}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Thời gian:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${data.reservationTime} · ${formattedDate}</td>
            </tr>
            ${data.tableName ? `
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Vị trí bàn:</td>
              <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">Bàn ${data.tableName} ${data.floor ? `(Tầng ${data.floor})` : ''}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Hình thức thanh toán:</td>
              <td style="padding: 6px 0; color: #059669; font-weight: 700;">${data.paymentMethod}</td>
            </tr>
            ${data.transactionCode ? `
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Mã giao dịch:</td>
              <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${data.transactionCode}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <!-- ITEMS TABLE -->
        <h3 style="margin: 0 0 12px; color: #1e293b; font-size: 15px; font-weight: 700;">
          📋 Danh sách món ăn phục vụ:
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #64748b; text-align: left;">
              <th style="padding: 10px 8px; font-weight: 600;">Món ăn</th>
              <th style="padding: 10px 8px; font-weight: 600; text-align: center;">SL</th>
              <th style="padding: 10px 8px; font-weight: 600; text-align: right;">Đơn giá</th>
              <th style="padding: 10px 8px; font-weight: 600; text-align: right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- TOTAL SETTLEMENT SUMMARY -->
        <div style="background-color: #f0fdf4; border-radius: 12px; padding: 18px 20px; border: 1px solid #bbf7d0; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0; color: #475569;">Tổng tiền món:</td>
              <td style="padding: 4px 0; color: #0f172a; font-weight: 600; text-align: right;">${formatCurrency(data.totalFoodAmount)}</td>
            </tr>
            ${data.depositAmount > 0 ? `
            <tr>
              <td style="padding: 4px 0; color: #059669;">Tiền cọc đã cấn trừ:</td>
              <td style="padding: 4px 0; color: #059669; font-weight: 600; text-align: right;">- ${formatCurrency(data.depositAmount)}</td>
            </tr>
            ` : ''}
            <tr style="border-top: 1px solid #86efac; font-size: 15px;">
              <td style="padding: 10px 0 4px; color: #166534; font-weight: 800;">Tổng thanh toán quyết toán:</td>
              <td style="padding: 10px 0 4px; color: #166534; font-weight: 800; font-size: 17px; text-align: right;">${formatCurrency(data.settlementAmount)}</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6; text-align: center;">
          Cảm ơn quý khách đã tin tưởng và lựa chọn FoodHub. Chúc quý khách một ngày thật nhiều niềm vui!
        </p>
      </div>

      <!-- FOOTER -->
      <div style="background-color: #f8fafc; padding: 20px 28px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
        <p style="margin: 0 0 6px;">FoodHub Restaurant Management System</p>
        <p style="margin: 0;">Hotline hỗ trợ khách hàng: 1900 xxxx (8:00 - 22:00 hàng ngày)</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
