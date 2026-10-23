# Security & Performance Guidelines (NestJS Backend)

Tài liệu này quy định các tiêu chuẩn bắt buộc về bảo mật và tối ưu hóa hiệu năng trong hệ thống Backend Nhà hàng (RRMS / FoodHub).

---

## 1. Authentication & Session Management

### 1.1 JWT (JSON Web Token) Flow
- **Cơ chế truyền Token:** Client gửi Access Token qua Header `Authorization: Bearer <token>`.
- **Strategy & Guards:**
  - `JwtStrategy`: Giải mã và xác thực token với secret được nạp từ `ConfigService.get('JWT_SECRET')`.
  - `JwtAuthGuard`: Bắt buộc token hợp lệ, trả về `401 Unauthorized` nếu thiếu hoặc token hết hạn.
  - `@CurrentUser()` Decorator: Trích xuất user an toàn từ request sau khi đã qua `JwtAuthGuard`.
- **Refresh Token Rotation:**
  - Lưu mã băm `tokenHash` trong bảng `refresh_tokens`.
  - Khi cấp Access Token mới, thu hồi `revoked: true` Refresh Token cũ và phát hành cặp token mới.
- **Token Blacklist qua Redis:**
  - Khi người dùng Logout hoặc đổi mật khẩu, đưa Access Token hiện tại vào Redis Blacklist với TTL tương ứng.

---

## 2. Authorization & Role-Based Access Control (RBAC)

- **Định nghĩa Role:** Enum `Role` trong Prisma (`ADMIN`, `STAFF`, `USER`).
- **Phân quyền Route:**
  ```typescript
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  ```
- **Ràng buộc:** `RolesGuard` **BẮT BUỘC** đi kèm hoặc đặt sau `JwtAuthGuard`. Không đặt `RolesGuard` đứng một mình vì cần `req.user` đã được xác thực trước.

---

## 3. Rate Limiting & Throttler

- **Mục tiêu:** Ngăn chặn tấn công Brute Force, DDOS và spam endpoint nhạy cảm (như Đăng nhập, Gửi OTP, Đặt bàn giữ chỗ).
- **Cấu hình:** Sử dụng `@nestjs/throttler` cấu hình mức giới hạn toàn cục và gắn `@Throttle(...)` cho các endpoint nhạy cảm.

---

## 4. Quản lý Bí mật & Môi trường (Fail-Fast Rule)

- **TUYỆT ĐỐI KHÔNG hard-code** secret, key, URL, mật khẩu database trong mã nguồn.
- **Fail-fast:** Tất cả biến môi trường (`DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST`, `REDIS_PORT`, `MAIL_HOST`) phải nạp qua `ConfigService`. Nếu thiếu, ứng dụng phải báo lỗi và dừng ngay khi khởi động; không sử dụng giá trị fallback.
- **Băm mật khẩu:** Bắt buộc dùng `bcrypt` với salt rounds >= 10 trước khi lưu vào database. Không lưu mật khẩu dạng plain text.

---

## 5. Redis Caching & In-Memory Storage

- **Cache dữ liệu tĩnh / tần suất đọc cao:**
  - Cache danh sách chi nhánh (`restaurants`), danh mục món (`menu_categories`), bảng giá thực đơn (`menu_items`).
  - Xóa hoặc cập nhật lại cache (Invalidate cache) ngay khi có thao tác Create / Update / Delete trên danh mục món hoặc chi nhánh.
- **Quản lý OTP & Cooldown:**
  - Lưu mã OTP xác thực email / đặt bàn vào Redis kèm TTL (5 phút) và cờ cooldown (60 giây) để tránh gửi lặp.

---

## 6. Tối ưu hóa Database & Prisma ORM

- **Tránh N+1 Query Problem:**
  - Sử dụng quan hệ `include` hoặc `select` của Prisma một cách có chọn lọc (ví dụ: `include: { category: true, tables: true }`).
  - Không viết vòng lặp `for/forEach` để gọi query database bên trong.
- **Indexing:**
  - Định nghĩa `@@index([branchId, isActive])` và `@@index([categoryId, isActive])` trong file schema Prisma cho các trường thường xuyên `WHERE` và `ORDER BY`.
- **Database Transactions:**
  - Mọi thao tác ghi từ 2 bảng trở lên (đặt bàn + giữ bàn, hủy đơn + hoàn tiền) bắt buộc sử dụng `this.prisma.$transaction(async (tx) => { ... })`.
- **Pagination (Phân trang):**
  - Mọi API danh sách (`tables`, `menu-items`, `reservations`, `users`) **BẮT BUỘC** áp dụng phân trang (`page`, `limit`, `skip`, `take`).
  - Trả về metadata: `total`, `page`, `limit`, `totalPages`.
