export interface PickupOrderReadyEmailData {
  customerName: string;
  orderCode: string;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  pickupTime: string;
  totalAmount: number;
  itemCount: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export function buildPickupOrderReadyEmailTemplate(data: PickupOrderReadyEmailData): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Món ăn đã sẵn sàng để nhận</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
  <div style="width: 100%; background-color: #f1f5f9; padding: 40px 12px; box-sizing: border-box;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
      
      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #16a34a, #22c55e); padding: 36px 28px; text-align: center; color: #ffffff;">
        <div style="font-size: 40px; margin-bottom: 8px;">🥡</div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Món ăn đã sẵn sàng!</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.95;">Đơn hàng mang về của quý khách đã hoàn tất chế biến</p>
      </div>

      <!-- MAIN CONTENT -->
      <div style="padding: 32px 28px;">
        <p style="font-size: 15px; color: #334155; margin: 0 0 16px;">
          Xin chào <strong>${data.customerName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          Bếp tại chi nhánh <strong>${data.branchName}</strong> vừa hoàn tất chế biến và đóng gói đơn hàng (${data.itemCount} món). Quý khách có thể ghé quầy mang về của chi nhánh để nhận món ngay bây giờ!
        </p>

        <!-- CODE BOX -->
        <div style="background-color: #f0fdf4; border: 2px dashed #86efac; border-radius: 12px; padding: 20px 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 12px; text-transform: uppercase; color: #15803d; font-weight: 700; letter-spacing: 1px;">Mã nhận hàng tại quầy</span>
          <div style="font-size: 32px; font-weight: 900; color: #16a34a; font-family: monospace; letter-spacing: 2px; margin-top: 6px;">
            ${data.orderCode}
          </div>
          <p style="margin: 6px 0 0; font-size: 13px; color: #166534; font-weight: 600;">
            Đã thanh toán: ${formatCurrency(Number(data.totalAmount))}
          </p>
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
            <td style="padding: 10px 0; color: #64748b;">Hotline liên hệ:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${data.branchPhone}</td>
          </tr>
          `
              : ''
          }
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b;">Khung giờ hẹn lấy:</td>
            <td style="padding: 10px 0; color: #16a34a; font-weight: 700;">${data.pickupTime}</td>
          </tr>
        </table>

        <!-- ALERT -->
        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 8px;">
          <h4 style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #b45309;">⚠️ Thưởng thức món ăn ngon nhất:</h4>
          <p style="margin: 0; font-size: 12.5px; color: #92400e; line-height: 1.6;">
            Món ăn vừa được chế biến xong và đang được giữ nóng. Quý khách vui lòng ghé quầy mang về của chi nhánh sớm để đảm bảo hương vị thơm ngon và chuẩn vị nhất nhé!
          </p>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 28px; text-align: center; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0 0 6px; font-weight: 600; color: #64748b;">Hệ thống nhà hàng FoodHub</p>
        <p style="margin: 0 0 8px;">Chúc quý khách có một bữa ăn ngon miệng!</p>
        <p style="margin: 0; font-size: 11px;">Email này được gửi tự động từ hệ thống. Quý khách vui lòng không phản hồi trực tiếp email này.</p>
      </div>

    </div>
  </div>
</body>
</html>
  `.trim();
}

