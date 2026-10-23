# Backend Architecture Rules (NestJS)

Mọi thay đổi mã nguồn Back-end phải tuân thủ nghiêm ngặt các quy định kiến trúc sau.
Tài liệu kiến trúc chi tiết (Source of Truth): `backend_architecture/`
- [README.md](../../backend_architecture/README.md)
- [api_rules.md](../../backend_architecture/api_rules.md)
- [security_and_performance.md](../../backend_architecture/security_and_performance.md)
- [workflow.md](../../backend_architecture/workflow.md)

## 1. Cấu Trúc Module & Phân Tầng
- Mỗi phân hệ nghiệp vụ phải tổ chức trong một module riêng biệt tại `src/modules/<tên-module>/`:
  - `controllers/`: Tiếp nhận HTTP request, gọi Service tương ứng, không chứa business logic phức tạp.
  - `services/`: Chứa toàn bộ business logic, tương tác với `PrismaService` hoặc cơ sở dữ liệu.
  - `dtos/`: Định nghĩa các Data Transfer Object (`Create...Dto`, `Update...Dto`, `Query...Dto`), validate bằng `class-validator` và `class-transformer`.
  - `<module-name>.module.ts`: Khai báo controllers, providers, exports.
- Core & Common:
  - Các Guard, Interceptor, Decorator, Exception Filter toàn cục đặt tại `src/core/common/`.
  - Prisma Client & connection đặt tại `src/prisma/`.
  - Redis Client đặt tại `src/redis/`.

## 2. Quy Chuẩn Response & Validation
- **Response Format**: Bắt buộc chuẩn hóa qua `TransformInterceptor`:
  ```json
  {
    "statusCode": 200,
    "message": "Nội dung thông báo",
    "data": { ... }
  }
  ```
- **Validation**:
  - DTO bắt buộc sử dụng các decorator như `@IsString()`, `@IsNotEmpty()`, `@IsOptional()`, `@IsEmail()`, `@IsNumber()`, `@Min()`, `@Max()`, `@Type()`.
  - Sử dụng `ValidationPipe({ transform: true, whitelist: true })` để loại bỏ các trường không mong muốn và tự động ép kiểu dữ liệu.

## 3. Database & Prisma ORM
- **Migration & Schema**: Mọi thay đổi cấu trúc bảng phải thực hiện trong `prisma/schema.prisma` và sinh migration.
- **Transactions**: Khi thực hiện nhiều thao tác ghi phụ thuộc lẫn nhau (ví dụ: tạo đặt bàn kèm chi tiết món ăn, hủy đơn hoàn tiền), bắt buộc dùng `this.prisma.$transaction(async (tx) => { ... })`.
- **Soft Delete**: Ưu tiên sử dụng cờ `deletedAt` hoặc `status: 'INACTIVE'` thay vì xóa vật lý nếu bảng liên quan đến lịch sử kinh doanh.

## 4. Quy Tắc Giới Hạn Code & Module
- Không để bất kỳ file nào vượt quá **500 dòng**. Chủ động chia nhỏ thành các helper hoặc sub-services khi logic tăng trưởng.
- Không hardcode giá trị fallback cho các biến môi trường (`DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`,...). Phải nạp từ `ConfigService` và báo lỗi ngay khi thiếu.
