# Backend Architecture (`Restaurant Reservation & Management System - RRMS Backend`)

Backend của hệ thống Nhà hàng (RRMS / FoodHub) được xây dựng bằng **NestJS** kết hợp **TypeScript**, thiết kế theo kiến trúc Module hóa (Modular Architecture) và phân tầng rõ ràng (Layered Architecture) nhằm đảm bảo tính toàn vẹn dữ liệu, hiệu năng cao và mở rộng linh hoạt theo chuỗi chi nhánh.

---

## 1. Công nghệ & Stack cốt lõi (Tech Stack)

- **Framework:** NestJS (Node.js runtime)
- **Ngôn ngữ:** TypeScript
- **Database & ORM:** PostgreSQL + Prisma ORM (Modular Schema tại `prisma/schema/*.prisma`)
- **Caching & Session:** Redis (`ioredis`, `@nestjs/cache-manager`)
- **Realtime / WebSocket:** Socket.IO / WebSockets (Cập nhật trạng thái bàn, đơn gọi món, thông báo)
- **Message Queue:** RabbitMQ (Xử lý tác vụ nền, email thông báo, thanh toán webhook)
- **Authentication & Security:** Passport JWT (`@nestjs/passport`, `passport-jwt`), Role-Based Access Control (RBAC: `ADMIN`, `STAFF`, `USER`), Redis Token Blacklist, `bcrypt`
- **Validation & Serialization:** `class-validator`, `class-transformer`
- **Mail Service:** Nodemailer / Mail Module (Gửi thông báo xác nhận đặt bàn, hóa đơn điện tử, OTP)
- **Containerization:** Docker & Docker Compose

---

## 2. Kiến trúc phân tầng & Luồng dữ liệu (API Data Flow)

Luồng xử lý chuẩn của mọi HTTP Request trong hệ thống Backend:

```mermaid
graph TD
    Client[Client: Web / Mobile / POS] --> Middleware[CORS / CookieParser / Express Middleware]
    Middleware --> Guards[Guards: JwtAuthGuard -> RolesGuard: USER / STAFF / ADMIN]
    Guards --> InterceptorIn[LoggingInterceptor / Request Interceptors]
    InterceptorIn --> Validation[ValidationPipe: class-validator DTO]
    Validation --> Controller[NestJS Controller: Routing & Parameter Parsing]
    Controller --> Service[Business Service Layer: 100% Business Logic]
    Service --> Prisma[Prisma ORM: Modular Schema & $transaction]
    Prisma --> Database[(PostgreSQL Database)]
    Service --> Redis[(Redis Cache / Token Blacklist / OTP)]
    Service --> Queue[(RabbitMQ / Async Events)]
    Service --> Mailer[Mail Service: Thông báo đặt bàn / Hóa đơn]
    Service --> Controller
    Controller --> InterceptorOut[TransformInterceptor: { statusCode, message, data }]
    InterceptorOut --> ClientResponse[Client Response JSON]

    Service -.->|Exception Thrown| ExceptionFilter[Global HttpExceptionFilter]
    ExceptionFilter --> ErrorResponse[Standard Error JSON: { statusCode, message, error }]
```

---

## 3. Cấu trúc thư mục Source Code (`src/`)

```text
src/
├── config/              # Nạp biến môi trường qua ConfigService (fail-fast, không fallback)
├── core/                # Hạ tầng dùng chung toàn hệ thống
│   ├── common/          # Guards, Interceptors (TransformInterceptor), Exception Filters
│   └── constants/       # Enum, metadata keys, mã lỗi
├── mail/                # Service gửi email đặt bàn, xác thực OTP, hóa đơn
├── prisma/              # PrismaService, kết nối PostgreSQL & extensions
├── redis/               # RedisService quản lý cache, session và token blacklist
├── modules/             # Các Domain Feature Modules nghiệp vụ
│   ├── auth/            # Đăng ký, đăng nhập Local/Google, Refresh Token, Logout
│   ├── users/           # Quản lý tài khoản, profile, nhân viên theo chi nhánh
│   ├── restaurants/     # Quản lý chi nhánh, địa giới (Province/Ward), giờ mở cửa
│   ├── tables/          # Quản lý loại bàn, danh sách bàn, trạng thái (AVAILABLE, OCCUPIED...)
│   ├── menus/           # Danh mục món ăn, món ăn, giá và tình trạng món theo chi nhánh
│   ├── reservations/    # Đặt bàn, kiểm tra slot giờ, số lượng khách, giữ bàn
│   ├── payments/        # Tích hợp cổng thanh toán cọc/hóa đơn, webhook callback
│   └── reviews/         # Đánh giá món ăn và dịch vụ nhà hàng
├── app.module.ts        # Root Module kết nối DB, Redis, Mailer và các Feature Modules
└── main.ts              # Bootstrap app, CORS, Global Pipes, Filters, Swagger/OpenAPI
```

---

## 4. Module tham chiếu chuẩn (Source of Truth)

Khi triển khai feature mới hoặc sửa đổi code, Agent **BẮT BUỘC** tham khảo:
1. **Authentication & RBAC:** `src/modules/auth/` và `src/core/common/`
2. **CRUD & Feature Flow:** `src/modules/menus/` và `src/modules/restaurants/`
3. **Database Transaction:** `src/modules/reservations/` và `src/modules/payments/`
4. **Response & Error Handling:** `src/core/common/interceptors/transform.interceptor.ts` & `src/core/common/filters/`

---

## 5. Danh mục tài liệu chi tiết liên quan

- [API Rules & Layer Conventions](api_rules.md)
- [Security & Performance Guidelines](security_and_performance.md)
- [Development Workflow & Lifecycle](workflow.md)
