---
name: be-createTestCase
description: >-
  Xây dựng ma trận kịch bản kiểm thử (Test Case Matrix) cho các API endpoint của Backend.
---

# be-createTestCase

Mục đích: Thiết lập bộ test case chi tiết cho API endpoint mà không sửa đổi code.

## Quy trình thực hiện (Workflow)

1. **Đọc mã nguồn endpoint**: Controller, DTO, Service logic.
2. **Liệt kê các trường hợp kiểm thử**:
   - Happy Path: Dữ liệu hợp lệ, trả về HTTP 200/201 với format chuẩn.
   - Validation Errors: Thiếu trường bắt buộc, sai định dạng email, sai kiểu số (HTTP 400).
   - Authentication & Authorization: Không có token (HTTP 401), sai quyền Role (HTTP 403).
   - Resource Not Found: Tìm kiếm ID không tồn tại (HTTP 404).
   - Conflict / Duplicate: Trùng email, trùng số điện thoại, trùng mã bàn (HTTP 409).
3. **Trình bày dưới dạng bảng Markdown**:
   | Test Case ID | Tên kịch bản | Pre-condition | Input Payload / Params | Expected HTTP Status | Expected Response Body |
