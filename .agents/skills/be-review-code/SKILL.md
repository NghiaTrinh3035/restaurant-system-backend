---
name: be-review-code
description: >-
  Review mã nguồn của branch hiện tại so với branch dev của Backend.
---

# be-review-code

Mục đích: Đánh giá chất lượng mã nguồn Backend trước khi mở PR.

## Quy trình thực hiện (Workflow)

1. **So sánh branch với `dev`**:
   - `git diff dev...HEAD`
   - Xác định danh sách file và dòng thay đổi.
2. **Kiểm tra tuân thủ kiến trúc**:
   - Tuân thủ `be-architecture-rules.md` (Module, DTO validation, Prisma query, TransformInterceptor).
   - Kiểm tra xem có file nào vượt quá 1000 dòng không.
   - Kiểm tra có hardcode `.env` fallback không.
3. **Báo cáo kết quả review**:
   - Điểm tốt (Strengths).
   - Điểm cần cải thiện (Improvement suggestions).
   - Các issue phát hiện theo chuẩn `shared-reporting-rules.md`.
