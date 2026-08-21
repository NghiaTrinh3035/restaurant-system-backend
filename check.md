Tôi đã rà soát tĩnh FE + BE hiện tại, **không sửa code**. Nhìn chung nền tảng đã có nhiều điểm tốt: JWT trong `HttpOnly Cookie`, Prisma, global validation pipe, global JWT guard và `.env` đã được ignore Git. Tuy nhiên, trước khi deploy thật, có một số điểm **nên ưu tiên xử lý**.

> [!IMPORTANT]
> Kết quả này là review source code hiện tại, không phải pentest thực tế hay kiểm tra cấu hình production/cloud.

# 1. Các vấn đề bảo mật ưu tiên cao

## 1.1. JWT đang được trả về trong response body
Mặc dù controller đã set `accessToken`/`refreshToken` vào `HttpOnly Cookie`, API login vẫn trả nguyên `result` có chứa cả token tại [auth.controller.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/controllers/auth.controller.ts#L43-L66).

`AuthService.login()` tạo và trả:

```ts
{
  accessToken,
  refreshToken,
  user
}
```

Điều này làm mất một phần lợi ích của HttpOnly Cookie: JavaScript ở FE vẫn có thể đọc token từ `response.data`. Nếu có XSS, token vẫn có nguy cơ bị lấy.

**Nên làm:** chỉ set token qua cookie, response body chỉ trả `user` hoặc trạng thái thành công; tuyệt đối không trả refresh token về FE.

Áp dụng tương tự cho luồng Google và đăng ký.

---

## 1.2. Cookie cross-site cần có biện pháp chống CSRF
Trong production, cookie dùng:

```ts
httpOnly: true,
secure: true,
sameSite: 'none'
```

xem tại [auth.controller.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/controllers/auth.controller.ts#L47-L64).

`SameSite: 'none'` thường cần khi FE và BE là hai domain khác nhau. Đổi lại, trình duyệt sẽ gửi cookie cho request cross-site, dẫn tới nguy cơ **CSRF** với các API thay đổi dữ liệu, ví dụ cập nhật profile, tạo đơn, đặt bàn, thanh toán, đổi mật khẩu.

Hiện chưa thấy cơ chế:
- CSRF token / double-submit cookie.
- Kiểm tra `Origin` / `Referer` nghiêm ngặt cho request ghi dữ liệu.
- CORS production bắt buộc chỉ một allow-list hợp lệ.

**Nên làm:**
- Nếu có thể: đặt FE và BE dưới cùng site, ví dụ `app.example.com` + `api.example.com`, cân nhắc `SameSite: 'lax'`.
- Nếu bắt buộc `SameSite: 'none'`: triển khai CSRF token và validate token ở BE.
- Không dùng wildcard CORS trong production.

---

## 1.3. Refresh token chưa được quản lý dù schema đã có bảng
Schema đã có model [RefreshToken](file:///d:/UTE/TLCN/restaurant-system-backend/prisma/schema.prisma#L27-L35), nhưng luồng hiện tại chỉ ký JWT rồi set cookie:

- Chưa thấy API `POST /api/auth/refresh`.
- Chưa thấy refresh token được hash/lưu database.
- Chưa thấy rotation (mỗi lần refresh đổi token).
- Logout chỉ xóa cookie tại trình duyệt, token đã bị lộ vẫn còn hiệu lực đến hạn.
- Reset password không thu hồi các refresh-token/session cũ.

Đây là khoảng trống lớn về kiểm soát phiên đăng nhập.

**Nên làm:**
1. Chỉ lưu **hash** refresh token vào DB.
2. Mỗi thiết bị/phiên có một bản ghi riêng, có `expiresAt`, `revoked`, device metadata nếu cần.
3. Khi refresh: verify → rotate token → revoke token cũ.
4. Logout: revoke session hiện tại; có thể thêm “logout all devices”.
5. Reset password / vô hiệu hóa user: revoke toàn bộ refresh tokens.

---

## 1.4. OTP dễ bị brute-force và spam email
OTP hiện được sinh bằng `Math.random()` trong [otp.service.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/services/otp.service.ts#L21-L29):

```ts
Math.floor(100000 + Math.random() * 900000)
```

Vấn đề:
- `Math.random()` không phải trình sinh số ngẫu nhiên mật mã.
- OTP lưu dạng plaintext trong Redis.
- Chưa thấy giới hạn số lần verify sai.
- Chưa thấy giới hạn gửi OTP theo IP/email.
- `resendOtp()` có thể bị spam mail và làm tăng chi phí.
- Chưa thấy cooldown, ví dụ chỉ cho gửi lại sau 30–60 giây.
- OTP log có email: [otp.service.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/services/otp.service.ts#L28), tạo PII trong log.

**Nên làm:**
- Sinh OTP bằng `crypto.randomInt`.
- Lưu hash OTP thay vì OTP plaintext.
- Giới hạn 3–5 lần nhập sai; vượt mức thì invalid key.
- Rate-limit theo IP và email đối với login, OTP, forgot password, Google callback.
- Cooldown resend OTP.
- Không log email/OTP ở mức production hoặc mask dữ liệu.

---

## 1.5. Google OAuth còn thiếu ràng buộc danh tính và account-linking
[GoogleStrategy](file:///d:/UTE/TLCN/restaurant-system-backend/src/core/security/google/google.strategy.ts#L7-L27) lấy email/profile, rồi [AuthService.googleLogin()](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/services/auth.service.ts#L203-L242) tìm user chỉ theo `email`.

Các điểm cần chú ý:

- `providerId` đã có trong Prisma schema nhưng **không được ghi** khi tạo user Google.
- Không thấy kiểm tra rõ `email_verified` từ Google.
- Nếu một email local đã tồn tại, Google login tự động đăng nhập vào account đó. Đây là policy cần được quyết định rõ:
  - **Cách an toàn hơn:** chỉ tự link account sau khi user đã đăng nhập local hoặc qua bước xác minh rõ ràng.
- Không nên dùng email là định danh OAuth duy nhất; cần lưu Google `profile.id` vào `providerId`.
- `emails[0]`, `photos[0]`, `name` có thể không tồn tại, dễ lỗi runtime nếu profile không như mong đợi.
- `GoogleStrategy` đang dùng fallback như `MISSING_CLIENT_ID` và callback localhost tại [google.strategy.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/core/security/google/google.strategy.ts#L10-L12). Production nên fail-fast khi thiếu biến môi trường, thay vì chạy với giá trị fallback.
- Cần xác nhận Google OAuth có bật `state` chống CSRF cho OAuth authorization flow. Đây là lớp bảo vệ quan trọng cho redirect-based OAuth.

---

# 2. Các vấn đề bảo mật quan trọng khác

## 2.1. Global exception filter có thể làm lộ lỗi nội bộ
Trong [global-exception.filter.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/core/exceptions/global-exception.filter.ts#L39-L42), mọi `Error` không phải `HttpException` sẽ trả thẳng:

```ts
message = exception.message;
```

Ví dụ Prisma, Redis, SMTP hoặc lỗi nội bộ có thể lộ:
- Tên bảng/cột database.
- Connection string một phần.
- Cấu trúc nội bộ.
- Chi tiết provider/cloud.

**Nên làm:** production chỉ trả `"Internal server error"` với mã trace/request ID; chi tiết lỗi chỉ log server-side.

---

## 2.2. CORS fallback `*` không nên tồn tại khi dùng credential
[main.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/main.ts#L17-L26) fallback:

```ts
const corsOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? ...
  : '*';
```

Trong khi `credentials: true`.

Dù browser không chấp nhận `Access-Control-Allow-Origin: *` đi cùng credentials theo chuẩn CORS, cấu hình fallback này vẫn dễ gây lỗi triển khai hoặc khiến đội ngũ tìm cách “mở toàn bộ” để chữa lỗi.

**Nên làm:**
- Production bắt buộc có `CORS_ALLOWED_ORIGINS`.
- Fail startup nếu biến này trống/không hợp lệ.
- Allow-list URL tuyệt đối, không dùng wildcard.
- Kiểm tra kỹ origin preview/staging/production.

---

## 2.3. Thiếu rate limiting ở các endpoint nhạy cảm
Các endpoint public như:
- `POST /api/auth/login`
- `POST /api/auth/register/request-otp`
- `POST /api/auth/resend-otp`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

đều cần hạn chế theo IP/email. Hiện global guard chỉ kiểm tra JWT hoặc `@Public()` tại [jwt-auth.guard.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/core/common/guards/jwt-auth.guard.ts#L17-L31), chưa thay thế cho rate limit.

**Rủi ro:** credential stuffing, password guessing, OTP brute-force, mail spam, denial of service.

**Nên làm:** dùng `@nestjs/throttler` với limit khác nhau:
- Login: giới hạn chặt theo IP + email.
- Gửi OTP/forgot password: cooldown theo email + IP.
- API chung: global throttling.

---

## 2.4. Không kiểm tra `isActive` tại lúc đăng nhập/xác thực
`User` có trường `isActive` trong [schema.prisma](file:///d:/UTE/TLCN/restaurant-system-backend/prisma/schema.prisma#L20-L21), nhưng:
- Login password chỉ kiểm tra user/password hash: [auth.service.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/services/auth.service.ts#L130-L161).
- Google login cũng không chặn user disabled.
- JWT strategy chỉ trust payload token, không query lại trạng thái user: [jwt.strategy.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/core/security/jwt/jwt.strategy.ts#L27-L32).

**Hệ quả:** Khi admin disable user, access token đã phát hành vẫn có thể tiếp tục dùng đến khi hết hạn; login mới cũng có thể vẫn thành công.

**Nên làm:** kiểm tra `isActive` khi login/OAuth; cân nhắc verify trạng thái user hoặc token/session version trong quá trình xác thực các request quan trọng.

---

## 2.5. Thiếu HTTP security headers
[main.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/main.ts) chưa thấy:
- Helmet.
- CSP.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy`.
- `Permissions-Policy`.
- HSTS ở production.

**Nên làm:** dùng `helmet` và cấu hình phù hợp, đặc biệt khi public API/Swagger.

---

## 2.6. Swagger đang public
Swagger được expose tại `/api/docs` trong [main.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/main.ts#L44-L52).

Không phải luôn là lỗ hổng, nhưng production nên:
- Tắt Swagger public, **hoặc**
- Chỉ mở qua VPN/IP allow-list/basic auth,
- Không đưa endpoint admin/nội bộ vào public docs,
- Đảm bảo docs không hiển thị ví dụ chứa secrets.

---

# 3. Kiểm tra DTO và dữ liệu đầu vào

Global `ValidationPipe` đã bật `whitelist`, `transform`, `forbidNonWhitelisted` ở [main.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/main.ts#L35-L42): đây là điểm rất tốt.

Các điểm nên cải thiện:

| Vị trí | Nhận xét | Đề xuất |
|---|---|---|
| [RegisterDto](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/dtos/register.dto.ts) | `fullName`, `phone` không có giới hạn max length/pattern. | Thêm `MaxLength`, regex phone theo thị trường, trim/normalize. |
| Password DTO | Mới chỉ `MinLength(6)`. | Nâng tối thiểu lên 8–12, max length hợp lý, chính sách password rõ ràng. |
| Email | Chưa thấy normalize về lowercase/trim. | Chuẩn hóa email trước query/lưu để tránh account duplicate/hành vi không nhất quán. |
| [UpdateUserProfileRequest](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/users/dto/user-profile.dto.ts) | `avatar` là bất kỳ string. | Chỉ nhận URL `https`, giới hạn length/domain, hoặc upload file qua service kiểm soát riêng. |
| API Pagination | Các module nghiệp vụ sau này sẽ cần pagination/filter validation. | Không nhận trực tiếp query không giới hạn. Thêm max limit, whitelist sort fields. |

---

# 4. Cấu trúc Backend nên cải thiện

## 4.1. Tách quản lý session/cookie ra khỏi controller
Logic set/clear cookie hiện đang lặp ở:
- Login: [auth.controller.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/controllers/auth.controller.ts#L39-L66)
- Logout: [auth.controller.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/controllers/auth.controller.ts#L93-L108)
- Google callback: [auth.controller.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/controllers/auth.controller.ts#L121-L145)

Nên tách một `AuthCookieService` hoặc utility tập trung để:
- Không lệch option cookie giữa các luồng.
- Dễ thêm `domain`, `path`, `sameSite`, `secure`, prefix cookie.
- Đảm bảo clear cookie dùng **đúng cùng options** lúc set.

---

## 4.2. Cấu hình environment cần được validate lúc app khởi động
`ConfigModule.forRoot({ isGlobal: true })` đã được đặt đúng ở [app.module.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/app.module.ts#L18-L33), nhưng chưa thấy validation schema cho biến môi trường.

**Nên bắt buộc validate:**
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- expiry hợp lệ và không mâu thuẫn
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- SMTP
- Redis credentials
- `APP_PUBLIC_URL`
- `CORS_ALLOWED_ORIGINS`

Nếu thiếu/sai, ứng dụng nên fail startup.

> [!WARNING]
> Có một điểm không nhất quán: [AuthJwtService](file:///d:/UTE/TLCN/restaurant-system-backend/src/core/security/jwt/auth-jwt.service.ts#L13-L24) fallback access-token là `15m`, nhưng controller fallback thời hạn cookie access token là `1d` tại [auth.controller.ts](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/auth/controllers/auth.controller.ts#L53-L59). Cookie có thể còn 1 ngày trong khi JWT đã hết hạn sau 15 phút. Không phải lỗ hổng trực tiếp nhưng là bug session/UX cần đồng bộ.

---

## 4.3. JWT typing và token claims
[AuthJwtService](file:///d:/UTE/TLCN/restaurant-system-backend/src/core/security/jwt/auth-jwt.service.ts) đang dùng `any` trong `expiresIn`, `verify...`, `decodeToken`.

Nên:
- Dùng type rõ ràng cho JWT payload và thời gian hết hạn.
- Có `issuer`, `audience`, `jti` nếu sẽ quản lý phiên/token blacklist.
- Chỉ giữ claims tối thiểu cần thiết.
- Đảm bảo secret mạnh, độc lập access vs refresh, xoay vòng khi lộ.

---

## 4.4. Redis module nên có lifecycle rõ ràng
[RedisModule](file:///d:/UTE/TLCN/restaurant-system-backend/src/redis/redis.module.ts#L7-L27) kết nối TLS là tốt. Nhưng nên bổ sung:
- Validate host/port/credential.
- Health check.
- Graceful disconnect khi app shutdown.
- Log kết nối thất bại có kiểm soát.
- Retry strategy phù hợp để tránh app treo hoặc retry vô hạn.

---

## 4.5. Module nghiệp vụ và schema chưa đồng bộ
Hiện [AppModule](file:///d:/UTE/TLCN/restaurant-system-backend/src/app.module.ts#L17-L42) đã import menu, table, reservation, payment, restaurant, review. Tuy nhiên database chỉ có:
- `User`
- `RefreshToken`

Ví dụ [MenusService](file:///d:/UTE/TLCN/restaurant-system-backend/src/modules/menus/services/menus.service.ts#L1-L8) mới là service rỗng. Điều này không sai khi đang scaffold, nhưng cần thống nhất roadmap:

1. Hoàn thành database models + migrations trước.
2. Sau đó implement service/domain rules.
3. Tiếp theo controller, guards/roles, DTO, tests.
4. Cuối cùng FE thay mock data bằng API.

Không nên để FE gọi API “nửa thật nửa mock” lâu dài vì dễ lệch data contract.

---

# 5. Rà soát Frontend

## 5.1. Dependency audit FE đang có lỗ hổng
Tôi đã chạy `npm audit --omit=dev --json`.

- **Backend:** `0 vulnerabilities` trong production dependencies.
- **Frontend:** `5 vulnerabilities`, gồm **5 mức high**.

Các package chính bị ảnh hưởng:
- `react-router-dom` / `react-router`: phiên bản hiện tại `7.14.1`; audit báo có các advisory high liên quan React Router.
- `vite 8.0.4`: audit báo advisory high trên Windows liên quan filesystem path handling.
- `postcss`: advisory path traversal/file disclosure.

**Nên làm:** cập nhật các dependency theo bản vá mà `npm audit` đề xuất, sau đó chạy build/lint và kiểm tra route/UI lại. Không nên dùng `npm audit fix --force` mù quáng vì có thể gây breaking change.

---

## 5.2. FE đã dùng cookie đúng, nhưng chưa có refresh/retry flow
[api.js](file:///d:/UTE/TLCN/restaurant-system-frontend/src/services/api.js#L3-L20) dùng:

```js
withCredentials: true
```

Đúng với mô hình HttpOnly cookie. Tuy nhiên interceptor hiện chỉ trả lỗi ra ngoài, chưa có:
- Retry một lần sau `401`.
- Gọi refresh-token endpoint.
- Chống nhiều request cùng refresh song song.
- Chuyển state logout nhất quán nếu refresh thất bại.

Điều này phụ thuộc vào việc BE cần hoàn thành refresh-token flow trước.

---

## 5.3. Route frontend chưa bảo vệ hoàn toàn
[App.jsx](file:///d:/UTE/TLCN/restaurant-system-frontend/src/App.jsx#L23-L34) có `GuestRoute`, nhưng `/profile`, `/checkout`, `/reservation` chưa thấy `ProtectedRoute`.

BE vẫn là lớp bảo vệ bắt buộc; FE route protection chủ yếu phục vụ UX. Nhưng nếu không có:
- User chưa login vẫn vào được UI Profile, đến khi API lỗi mới phản hồi.
- UX không rõ ràng.
- Các trang thanh toán/đặt bàn sau này có thể rơi vào state không hợp lệ.

**Nên làm:** tạo `ProtectedRoute` và quy ước route nào public, auth-required, staff/admin-required.

---

## 5.4. Không để secret vào `VITE_*`
Điểm quan trọng khi deploy:

`VITE_API_URL` là an toàn vì chỉ là public URL. Nhưng mọi biến bắt đầu bằng `VITE_` đều được bundle xuống browser.

**Không được đưa vào FE:**
- Google Client Secret.
- JWT secret.
- Database/Redis URI.
- SMTP password.
- Payment secret/webhook secret.

Google OAuth nên khởi động ở BE như hiện tại, FE chỉ redirect tới `${VITE_API_URL}/auth/google`.

---

# 6. Thứ tự nên xử lý

## P0 — Làm trước khi production
1. Không trả access/refresh token trong JSON body.
2. Thiết kế refresh-token persistence, rotation, revoke và endpoint refresh.
3. CSRF protection khi dùng cookie cross-site.
4. Rate limit login/OTP/reset password.
5. Sửa Google OAuth: `providerId`, verified email, state, policy account-linking.
6. Không lộ internal exception message.
7. Cập nhật FE dependencies đang có advisory high.
8. Validate toàn bộ environment variables và chặn startup khi thiếu secret.

## P1 — Làm ngay sau đó
1. Helmet/security headers, production Swagger policy.
2. Kiểm tra `isActive` ở login, Google OAuth và JWT/session validation.
3. OTP dùng `crypto`, hash trong Redis, attempt limit/cooldown.
4. Đồng nhất thời hạn JWT với cookie.
5. `ProtectedRoute` ở FE.
6. Tách cookie/session logic khỏi `AuthController`.

## P2 — Khi triển khai nghiệp vụ chính
1. Thêm Role/Permission guard cho admin/staff.
2. Thiết kế transaction/concurrency cho reservation, tồn bàn và thanh toán.
3. Validation pagination/filter/sort.
4. Upload ảnh qua storage chuyên dụng, validate content/type/size.
5. Audit log cho thay đổi role, payment, cancellation, reset password.
6. E2E tests cho auth, CSRF, refresh rotation, OTP rate-limit và OAuth callback.