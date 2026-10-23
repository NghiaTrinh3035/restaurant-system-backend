---
name: be-resolveIssues
description: >-
  Tiếp nhận một Issue ID, tự động checkout branch mới từ dev và lập kế hoạch giải quyết.
---

# be-resolveIssues

Mục đích: Giải quyết issue theo quy trình chuẩn từ nhánh mới.

## Quy trình thực hiện (Workflow)

1. **Hiểu Issue**: Đọc nội dung mô tả issue, yêu cầu kỹ thuật và acceptance criteria.
2. **Checkout Branch Mới**:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b issue/<issue-id>-<tên-ngắn-gọn>
   ```
3. **Lập Implementation Plan**: Xác định các file cần sửa và giải pháp cụ thể.
4. **Chờ Phê Duyệt**: Đợi người dùng duyệt plan trước khi thực thi code.
5. **Sau khi hoàn thành**: Hướng dẫn dùng `/be-createPR` để mở Pull Request vào `dev`.
