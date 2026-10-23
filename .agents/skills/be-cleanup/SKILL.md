---
name: be-cleanup
description: >-
  Dọn dẹp các file rác, file log, thư mục tạm trước khi commit hoặc sau khi hoàn thành task.
---

# be-cleanup

Mục đích: Đảm bảo working tree sạch sẽ, không có file thừa trước khi commit.

## Quy trình thực hiện (Workflow)

1. Kiểm tra untracked files: `git status --short`.
2. Xác định các file rác tiềm năng:
   - Các file `*.log`, `npm-debug.log*`
   - File kết quả export tạm, file `.tmp`
   - Thư mục build thừa hoặc test dump
3. **Xác nhận trước khi xóa**:
   - Nếu không chắc chắn 100% một file là rác, Agent PHẢI hỏi ý kiến người dùng trước khi xóa.
