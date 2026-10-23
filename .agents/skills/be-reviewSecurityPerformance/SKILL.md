---
name: be-reviewSecurityPerformance
description: >-
  Đánh giá an toàn thông tin và hiệu năng cơ sở dữ liệu của code Backend.
---

# be-reviewSecurityPerformance

Mục đích: Đánh giá bảo mật và hiệu năng của code mới trên Backend.

## Checklist Bảo Mật
- [ ] Mật khẩu có được băm qua bcrypt không? Có bị lộ trường `password` trong response không?
- [ ] Endpoint có áp dụng `JwtAuthGuard` và kiểm tra `@Roles()` đúng thẩm quyền không?
- [ ] Có nguy cơ SQL injection hoặc query raw không an toàn không?
- [ ] Các endpoint nhạy cảm (auth, otp) có rate limiting không?

## Checklist Hiệu Năng
- [ ] Có vòng lặp query trong DB gây lỗi N+1 không?
- [ ] Các bảng tra cứu lớn có được đánh index phù hợp trong `schema.prisma` không?
- [ ] Các thao tác ghi đồng thời nhiều bảng có được bọc trong Prisma transaction không?
- [ ] Dữ liệu danh sách có phân trang đầy đủ không?
