# Backend AI Agent System (FoodHub / RRMS Backend)

Hệ thống AI Agent Skills & Rules này được thiết kế để chuẩn hóa quy trình phát triển Back-end (NestJS, Prisma ORM, PostgreSQL, Redis), đảm bảo tính an toàn, bảo mật, tuân thủ kiến trúc và quản lý Pull Request (PR) tự động vào nhánh `dev`.

## Repository Information
- **Repository**: `NghiaTrinh3035/restaurant-system-backend`
- **Base Development Branch**: `dev`
- **Core Tech Stack**: NestJS, TypeScript, Prisma ORM, PostgreSQL, Redis, RabbitMQ, Docker

---

## Danh sách Skills (Commands)

| Command | Mục đích | Input | Quyền sửa code | Quyền Git | Yêu cầu Approval |
|:---|:---|:---|:---:|:---:|:---:|
| `/be-newFeature` | Phân tích và lập kế hoạch tính năng Backend mới | Mô tả tính năng | Có (khi có plan) | Không | **CÓ** (Implementation Plan) |
| `/be-fixbug` | Phân tích root cause và lập kế hoạch sửa lỗi API | Mô tả bug / log | Có (khi có plan) | Không | **CÓ** (Implementation Plan) |
| `/be-analyzeTask` | Phân tích scope, rủi ro, liên kết kiến trúc của task | Mô tả task | Không | Không | Không |
| `/be-createTestCase` | Xây dựng bảng ma trận kịch bản kiểm thử API | Mô tả endpoint | Không | Không | Không |
| `/be-review-code` | Review code branch hiện tại so với `dev` | Không/Branch name | Không | Không | Không |
| `/be-reviewSecurityPerformance` | Đánh giá an toàn thông tin & hiệu năng query DB | Branch name | Không | Không | Không |
| `/be-createPR` | Kiểm tra build, push branch và tạo URL mở Pull Request vào `dev` | Không | Không | Có (push) | Không (chỉ tạo URL PR) |
| `/be-reviewPR` | **Tổng hợp:** Review toàn diện và Merge PR | Branch name | Không | Có (merge, xóa branch) | **CÓ** (Trước khi Merge) |
| `/be-cleanup` | Dọn dẹp log, cache, file tạm trước khi commit | Không | Không (chỉ xóa rác) | Không | **CÓ** (Trước khi xóa) |
| `/be-newIssues` | Tạo issue / ticket theo mẫu chuẩn | Mô tả công việc | Không | Không | Không |
| `/be-resolveIssues` | Tạo nhánh mới từ `dev` và thực thi sửa chữa theo issue | Issue ID | Có (khi có plan) | Có (checkout -b) | **CÓ** (Implementation Plan) |

---

## Quy tắc quan trọng bắt buộc xác nhận (User Confirmation)
1. **Thực thi code mới / sửa code**: Phải đưa ra Implementation Plan trước, người dùng duyệt mới được code.
2. **Checkout branch mới**: Luôn checkout nhánh mới từ `dev` (`feature/...`, `fix/...`, `chore/...`), không sửa trực tiếp trên `dev`.
3. **Merge Pull Request**: Chỉ khi người dùng duyệt Audit Report mới được phép merge vào `dev`.
4. **Không force push**: Tuyệt đối cấm `git push --force`.
