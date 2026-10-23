---
name: be-analyzeTask
description: >-
  Phân tích một task Backend trước khi bắt đầu implementation.
  Không thực hiện thay đổi code, chỉ trả về phân tích scope, kiến trúc và rủi ro.
---

# be-analyzeTask

Mục đích: Phân tích một task Backend trước khi bắt đầu implementation.

## Quy trình thực hiện (Workflow)

### Step 1 — Analyze
Đọc yêu cầu task, phân tích trong ngữ cảnh của codebase NestJS hiện tại:
- Yêu cầu chức năng (Requirement)
- Phạm vi thay đổi (Scope)
- Module / Service / Controller bị ảnh hưởng
- Prisma Schema & Database Migration (nếu có)
- Rủi ro phá vỡ tương thích API (Breaking Changes)
- Điểm cần làm rõ với người dùng (Questions/Unknowns)
- Đề xuất phương án thiết kế (Implementation Recommendation)

### Step 2 — Report
Trình bày kết quả phân tích theo cấu trúc trên.
**Ràng buộc:** Skill này KHÔNG được phép tự viết code.
