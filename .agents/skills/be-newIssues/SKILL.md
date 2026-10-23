---
name: be-newIssues
description: >-
  Tạo bản mô tả Issue/Task kỹ thuật chuẩn hóa cho Backend.
---

# be-newIssues

Mục đích: Định dạng và cấu trúc hóa một issue kỹ thuật (Bug report hoặc Feature request) cho Backend.

## Mẫu Issue Chuẩn

```markdown
### Tiêu đề Issue: [Loại] Tên ngắn gọn

**Phân hệ**: [Auth / Branch / Table / Menu / Order / Reservation / Staff]
**Mức độ ưu tiên**: [Thấp / Trung bình / Cao / Khẩn cấp]

#### 1. Mô tả chi tiết
[Mô tả bối cảnh hoặc tính năng cần triển khai]

#### 2. Yêu cầu kỹ thuật
- Endpoint liên quan: `METHOD /api/v1/...`
- DTO cần tạo: ...
- Prisma models bị ảnh hưởng: ...

#### 3. Tiêu chí nghiệm thu (Acceptance Criteria)
- [ ] API trả về HTTP status và response payload đúng chuẩn.
- [ ] Đã validate đầu vào qua DTO.
- [ ] Không có lỗ hổng bảo mật hoặc N+1 query.
```
