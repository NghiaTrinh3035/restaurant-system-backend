# Shared Reporting Rules

Các báo cáo (Report) do Agent tạo ra phải ngắn gọn nhưng có cấu trúc rõ ràng.

1. **Phân loại Issue (Severity):**
   Mọi issue phát hiện được phải được gắn nhãn mức độ nghiêm trọng:
   - `BLOCKER`: Lỗi nghiêm trọng ngăn cản chức năng hoạt động hoặc crash server.
   - `HIGH`: Lỗi quan trọng cần sửa ngay nhưng không làm crash toàn bộ API.
   - `MEDIUM`: Lỗi logic hoặc vấn đề cần khắc phục nhưng có thể chấp nhận tạm thời.
   - `LOW`: Vấn đề nhỏ, không ảnh hưởng lớn đến chức năng.
   - `INFO`: Thông tin, lưu ý, hoặc chia sẻ kiến thức.

2. **Phân biệt tính chất của phát hiện:**
   - **Confirmed Issue**: Vấn đề đã chắc chắn là lỗi (có bằng chứng, log). KHÔNG gọi một vấn đề là "bug" nếu chưa có đủ evidence.
   - **Potential Risk**: Rủi ro tiềm ẩn (có thể xảy ra trong tương lai hoặc ở edge cases).
   - **Recommendation**: Đề xuất cải thiện (không bắt buộc).

3. **Cấu trúc của một Issue Report chuẩn:**
   ```text
   Severity: [BLOCKER|HIGH|MEDIUM|LOW|INFO]
   File: [Tên file]
   Location: [Dòng/Hàm cụ thể]
   Problem: [Mô tả vấn đề]
   Why it matters: [Tại sao điều này quan trọng/gây lỗi]
   Recommendation: [Cách khắc phục đề xuất]
   ```
