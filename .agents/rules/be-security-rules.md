# Backend Security & Performance Rules

Mọi tính năng và API Back-end phải đáp ứng các tiêu chuẩn bảo mật và hiệu năng sau:

## 1. Bảo Mật Xác Thực & Phân Quyền (Auth & RBAC)
- **Mật Khẩu**:
  - Không bao giờ lưu trữ mật khẩu dạng plain-text. Luôn băm với `bcrypt` (tối thiểu 10 salt rounds).
  - Không trả về trường `password` trong bất kỳ response nào (sử dụng Prisma `select` loại bỏ password hoặc dùng transformer).
- **Token**:
  - Access Token dùng JWT có thời gian hết hạn ngắn (15m - 1h). Refresh Token được lưu trong DB/Redis có gắn với user và thiết bị, có cơ chế revoke khi logout.
  - Sử dụng `JwtAuthGuard` để bảo vệ API và decorator `@CurrentUser()` để lấy thông tin xác thực an toàn.
- **Role-based Access Control (RBAC)**:
  - Các endpoint nhạy cảm (Quản trị chi nhánh, Quản lý thực đơn, Quản lý bàn ăn, Quản lý nhân viên) phải được bảo vệ bằng `@Roles(Role.ADMIN)` hoặc `@Roles(Role.STAFF)`.

## 2. Bảo Vệ Dữ Liệu & Chống Tấn Công
- **SQL Injection**: Luôn sử dụng Prisma ORM parameterized queries. Tránh sử dụng `$queryRawUnsafe` trừ trường hợp bất khả kháng và phải sanitize tham số kỹ lưỡng.
- **Rate Limiting**: Áp dụng `@nestjs/throttler` (ThrottlerGuard) cho các endpoint nhạy cảm như Đăng nhập, Gửi OTP, Quên mật khẩu để ngăn chặn brute-force và DDoS.
- **CORS & Headers**: Cấu hình CORS chặt chẽ, chỉ cho phép origin từ Frontend SPA; sử dụng `helmet` để bảo vệ HTTP headers.

## 3. Hiệu Năng & Database Indexing
- **N+1 Query**: Luôn sử dụng Prisma `include` hoặc batching query hợp lý để tránh N+1 problem khi lấy quan hệ giữa các bảng.
- **Phân Trang**: Mọi API trả về danh sách (danh mục món ăn, danh sách bàn, lịch sử đơn) bắt buộc phải có phân trang (`page`, `limit` hoặc cursor-based).
- **Redis Caching**: Sử dụng Redis để cache dữ liệu ít thay đổi nhưng truy vấn nhiều (danh mục món ăn, thông tin chi nhánh, menu chung).
