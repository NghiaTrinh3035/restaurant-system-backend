---
name: be-reviewPR
description: >-
  Workflow tổng hợp để review toàn diện PR của Backend trước khi bấm merge vào dev.
---

# be-reviewPR

Mục đích: Đánh giá toàn diện chất lượng PR (Logic, Kiến trúc, Bảo mật, Hiệu năng) và hỗ trợ merge khi được người dùng chấp thuận.

## Dependencies
- [be-review-code](../be-review-code/SKILL.md)
- [be-reviewSecurityPerformance](../be-reviewSecurityPerformance/SKILL.md)
- [Backend Git Rules](../../rules/be-git-rules.md)

## Quy trình thực hiện (Workflow)

1. **So sánh branch với `dev`**: Đọc toàn bộ diff.
2. **Đánh giá logic & kiến trúc**: Kiểm tra Controller, Service, DTO, Prisma model.
3. **Đánh giá bảo mật & hiệu năng**: Kiểm tra Auth Guard, Role, transaction, index.
4. **Tạo Audit Report**: Tổng hợp các điểm đạt và các issue cần sửa.
5. **DỪNG LẠI CHỜ PHÊ DUYỆT**:
   - **Ràng buộc nghiêm ngặt:** Sau khi lập report, Agent KHÔNG ĐƯỢC tự ý merge. Phải chờ người dùng gõ xác nhận đồng ý.
6. **Thực hiện merge (Khi được duyệt)**:
   - `git checkout dev && git pull origin dev`
   - `git merge <feature-branch>`
   - `git push origin dev`
