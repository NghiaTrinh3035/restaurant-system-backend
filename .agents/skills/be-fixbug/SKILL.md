---
name: be-fixbug
description: >-
  Phân tích bug và tạo Implementation Plan để sửa bug trên Backend.
  Truy vết root cause và đưa ra phương án sửa lỗi an toàn.
---

# be-fixbug

Mục đích: Phân tích bug và tạo Implementation Plan để sửa bug trên Backend.

## Dependencies
- [Shared Workflow](../../rules/shared-workflow.md)
- [Backend Architecture Rules](../../rules/be-architecture-rules.md)
- [Backend Git Rules](../../rules/be-git-rules.md)

## Quy trình thực hiện (Workflow)

### Step 1 — Understand Bug
Đọc kỹ mô tả lỗi, HTTP status code và error stack trace:
- Expected behavior vs Actual behavior
- Input request gây lỗi
- Endpoint và module bị ảnh hưởng

### Step 2 — Trace Root Cause
- Truy vết luồng: `Controller -> ValidationPipe -> Service -> PrismaService -> DB`
- Kiểm tra các commit gần đây xem thay đổi nào dẫn đến bug (`git log`, `git blame`)
- Xác định nguyên nhân gốc rễ (Root Cause), phân biệt với triệu chứng bề mặt

### Step 3 — Create Implementation Plan
- Checkout branch mới từ `dev`: `fix/<bug-name>`
- Files cần sửa đổi [MODIFY]
- Kế hoạch sửa đổi chi tiết
- Kịch bản kiểm thử hồi quy (Regression Test)

**STOP CONDITION:** KHÔNG được sửa code ngay nếu user chỉ yêu cầu tạo plan.
