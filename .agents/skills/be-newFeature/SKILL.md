---
name: be-newFeature
description: >-
  Tiếp nhận mô tả của user về chức năng Backend mới và xây dựng Implementation Plan trước khi triển khai.
---

# be-newFeature

Mục đích: Tiếp nhận mô tả chức năng mới và xây dựng Implementation Plan trước khi triển khai.

## Dependencies
- [Shared Workflow](../../rules/shared-workflow.md)
- [Backend Architecture Rules](../../rules/be-architecture-rules.md)
- [Backend Git Rules](../../rules/be-git-rules.md)

## Quy trình thực hiện (Workflow)

### Step 1 — Understand Requirement
Đọc và phân tích toàn bộ mô tả chức năng user cung cấp:
- Mục tiêu, Actor (Customer, Staff, Admin)
- RESTful API endpoints cần tạo mới/bổ sung (`METHOD /api/v1/...`)
- Input DTO & Validation rules
- Response format & Error handling
- Database schema changes (Prisma model, quan hệ, index)

### Step 2 — Inspect Existing Code
Tìm module/service liên quan trong `src/modules/`.
**Ràng buộc:** Không được tạo code mới nếu đã tồn tại service/helper có thể tái sử dụng.

### Step 3 — Create Implementation Plan
Tạo Implementation Plan chỉ rõ:
- Checkout branch mới từ `dev`: `feature/<feature-name>`
- Files cần tạo mới [NEW] và files cần sửa đổi [MODIFY]
- Chi tiết DTO, Controller, Service logic
- Prisma schema diff & migration plan
- Verification Plan (Build test, manual curl/postman test)

**STOP CONDITION:** KHÔNG được viết code ngay nếu user chưa duyệt plan. Chỉ đưa ra plan và đợi XÁC NHẬN (Approval).
