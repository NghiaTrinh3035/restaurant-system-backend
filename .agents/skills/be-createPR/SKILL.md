---
name: be-createPR
description: >-
  Chuẩn bị code hiện tại, push branch lên GitHub và tạo URL mở Pull Request vào nhánh dev.
---

# be-createPR

Mục đích: Chuẩn bị code trên branch hiện tại, push lên GitHub và tạo Pull Request vào nhánh `dev` của repository `NghiaTrinh3035/restaurant-system-backend`.

## Dependencies
- [Backend Git Rules](../../rules/be-git-rules.md)

## Quy trình thực hiện (Workflow)

### Step 1 — Branch Validation
- Kiểm tra branch hiện tại (`git branch --show-current`).
- **Ràng buộc:** Nếu đang ở trực tiếp trên `dev` hoặc `main`, Agent **BẮT BUỘC** phải yêu cầu checkout ra nhánh mới (`git checkout -b <feature|fix>/<name>`) trước khi commit và push.

### Step 2 — Check Status & Clean
- Chạy `git status`, `git diff`.
- Đảm bảo không có file rác, file `.log`, dữ liệu tạm.
- Chạy thử lệnh build (`npm run build`) để đảm bảo không có lỗi biên dịch TypeScript.

### Step 3 — Commit & Push
- Commit code theo chuẩn Conventional Commits.
- Push branch lên remote: `git push -u origin <current-branch>`.

### Step 4 — Generate Pull Request URL
Tạo đường link Pull Request trực tiếp:
```text
https://github.com/NghiaTrinh3035/restaurant-system-backend/compare/dev...<current-branch>?expand=1
```

### Step 5 — PR Body Template
Cung cấp nội dung mẫu cho mô tả PR:
```markdown
## Tóm tắt (Summary)
[Mô tả ngắn gọn chức năng hoặc bug fix]

## Các thay đổi chính (Changes)
- [Module / file thay đổi]

## Kiểm thử (Testing)
- [x] Đã kiểm tra build không lỗi (`npm run build`)
- [x] Đã kiểm tra API response format chuẩn

## Rủi ro (Risk)
- [Thấp / Trung bình / Cao]
```

**STOP CONDITION:** TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý MERGE PULL REQUEST.
