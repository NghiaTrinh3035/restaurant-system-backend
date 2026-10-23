# BACKEND AGENT RULES (FoodHub / RRMS Backend)

> **BẮT BUỘC TUÂN THỦ ĐỐI VỚI MỌI THAO TÁC CỦA AGENT TRÊN BACKEND**:
> 
> 1. **Không fallback biến môi trường (.env)**:
>    - Tuyệt đối không hardcode giá trị mặc định/fallback trong mã nguồn cho bất kỳ biến môi trường nào (`DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `JWT_SECRET`, `JWT_ACCESS_EXPIRATION`, `PORT`,...).
>    - Bắt buộc nạp cấu hình qua `ConfigService` của NestJS. Nếu thiếu biến môi trường, hệ thống phải dừng lại và báo lỗi ngay (fail-fast).
> 
> 2. **Giới hạn độ dài file (Tối đa 500 dòng)**:
>    - Tuyệt đối không viết hoặc để bất kỳ file code nào vượt quá **500 dòng**.
>    - Nếu module/service tiệm cận 500 dòng, bắt buộc phải chủ động tách nhỏ thành các service con, helper, custom repository hoặc file DTO riêng biệt trước khi thêm logic mới.
> 
> 3. **Chuẩn RESTful API & Response Payload**:
>    - Tất cả response trả về từ Controller phải đi qua `TransformInterceptor` theo định dạng chuẩn:
>      ```json
>      {
>        "statusCode": 200,
>        "message": "Thông báo kết quả",
>        "data": { ... }
>      }
>      ```
>    - Mọi input request phải được validate chặt chẽ thông qua DTO class với `class-validator` và `class-transformer`.
> 
> 4. **Bảo mật, Phân quyền (RBAC) & Database Transaction**:
>    - Mọi endpoint cần bảo vệ phải sử dụng `JwtAuthGuard` và `RolesGuard`.
>    - Sử dụng decorator `@CurrentUser()` để lấy thông tin user xác thực; không đọc trực tiếp payload thô từ request header.
>    - Các thao tác ghi nhiều bảng liên quan (như tạo đơn, đặt bàn, cập nhật nhiều bản ghi) bắt buộc bọc trong Prisma Transaction (`this.prisma.$transaction(...)`).
> 
> 5. **Dọn dẹp trước khi commit**:
>    - Bắt buộc xóa sạch toàn bộ file test tạm, file rác, file `.log`, dữ liệu seed thử nghiệm trước khi tạo commit.
> 
> 6. **Quy tắc Git & Pull Request (Target: `dev`)**:
>    - Nhánh phát triển chính của Backend là **`dev`**.
>    - Mọi nhánh mới phải checkout từ `dev`: `feature/<tên-tính-năng>` hoặc `fix/<tên-lỗi>`.
>    - Commit message phải tuân thủ Conventional Commits (`feat: ...`, `fix: ...`, `refactor: ...`, `chore: ...`).
>    - Mọi Pull Request tạo ra bắt buộc nhắm tới nhánh đích là **`dev`** trên repository `NghiaTrinh3035/restaurant-system-backend`.
>    - Tuyệt đối **KHÔNG** chạy `git push --force` và **KHÔNG** tự ý merge PR khi chưa có sự xác nhận của người dùng.
