# Backend API Rules & Layer Responsibilities

Tài liệu này quy định chuẩn thiết kế và phân tầng trách nhiệm cho toàn bộ Backend NestJS trong hệ thống Nhà hàng (RRMS / FoodHub).

---

## 1. Controller Layer (`*.controller.ts`)

**Nhiệm vụ:** Là tầng tiếp nhận HTTP Request, routing, áp dụng Guards/Decorators, bóc tách DTO, gọi Service và trả về dữ liệu cho Interceptor chuẩn hóa.

### DO (Nên làm):
- Sử dụng `@Controller('path')` với prefix rõ ràng theo chuẩn RESTful (ví dụ: `@Controller('branches')`, `@Controller('menu-items')`).
- Áp dụng các Guards phù hợp: `@UseGuards(JwtAuthGuard, RolesGuard)` kết hợp `@Roles(Role.ADMIN, Role.STAFF)`.
- Gắn decorator HTTP method rõ ràng: `@Get()`, `@Post()`, `@Put()`, `@Delete()`, `@Patch()`.
- Parse parameters bằng decorators: `@Body() dto: CreateDto`, `@Param('id') id: string`, `@Query() query: PaginationQueryDto`, `@CurrentUser() user: AuthenticatedUser`.
- Giữ Controller mỏng, tối đa 200 dòng, không chứa logic nghiệp vụ.

### DON'T (Tuyệt đối KHÔNG):
- **KHÔNG** chứa Business Logic trong Controller (chuyển toàn bộ vào Service).
- **KHÔNG** inject hoặc gọi trực tiếp `PrismaService` trong Controller.
- **KHÔNG** đọc trực tiếp payload thô từ header của request hoặc tự decode JWT; luôn dùng `@CurrentUser()`.
- **KHÔNG** tự catch Exception rồi trả về response lỗi thủ công (hãy throw Exception chuẩn để Exception Filter xử lý tự động).

```typescript
// Mẫu Controller chuẩn
@Controller('menu-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenuItemsController {
  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.USER)
  async findAll(@Query() query: QueryMenuItemDto) {
    return await this.menuItemsService.findAll(query);
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(
    @Body() dto: CreateMenuItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return await this.menuItemsService.create(dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string) {
    return await this.menuItemsService.remove(id);
  }
}
```

---

## 2. Service Layer (`*.service.ts`)

**Nhiệm vụ:** Nơi tập trung 100% Business Logic, kiểm tra ràng buộc nghiệp vụ, gọi `PrismaService`, giao tiếp với `RedisService`, `MailService` và ném lỗi có chủ đích.

### DO (Nên làm):
- Đánh dấu `@Injectable()`.
- Inject `PrismaService` và các Service phụ thuộc qua constructor.
- Kiểm tra tính toàn vẹn dữ liệu và logic nghiệp vụ trước khi ghi dữ liệu.
- Ném lỗi bằng các NestJS Built-in Exceptions (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`).
- Sử dụng `this.prisma.$transaction(async (tx) => { ... })` cho các nghiệp vụ cập nhật nhiều bảng liên quan (như Tạo đặt bàn, Hủy đặt bàn hoàn cọc, Chuyển bàn).
- Tách nhỏ service khi vượt quá 500 dòng thành các helper service hoặc domain services con.

### DON'T (Tuyệt đối KHÔNG):
- **KHÔNG** truy cập trực tiếp các đối tượng HTTP request/response của Express (`req`, `res`) trong Service. Hãy truyền thuần túy DTO, ID, User Object từ Controller xuống.
- **KHÔNG** hardcode giá trị cấu hình trong Service; luôn inject `ConfigService`.
- **KHÔNG** thực hiện nhiều thao tác ghi dữ liệu phụ thuộc lẫn nhau mà không bọc trong transaction.

```typescript
// Mẫu Service chuẩn
@Injectable()
export class MenuItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findById(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        category: true,
        branchMenuItems: true,
      },
    });

    if (!item || !item.isActive) {
      throw new NotFoundException('Món ăn không tồn tại hoặc đã ngừng kinh doanh');
    }

    return item;
  }
}
```

---

## 3. DTO & Validation Layer (`dtos/*.dto.ts`)

**Nhiệm vụ:** Định nghĩa cấu trúc dữ liệu đầu vào / đầu ra và ràng buộc xác thực dữ liệu qua `class-validator` và `class-transformer`.

### Quy tắc:
- Mọi trường dữ liệu nhận từ client **BẮT BUỘC** có decorator validation.
- Sử dụng `@IsString()`, `@IsNotEmpty()`, `@IsOptional()`, `@IsNumber()`, `@IsEmail()`, `@IsEnum()`, `@Min()`, `@Max()`, `@IsArray()`, v.v.
- Khi parse query parameters dạng số hoặc boolean, sử dụng `@Type(() => Number)` hoặc `@Type(() => Boolean)`.
- DTO cập nhật (`Update...Dto`) kế thừa từ `PartialType(Create...Dto)` của `@nestjs/mapped-types`.

```typescript
// Mẫu DTO chuẩn
export class CreateMenuItemDto {
  @IsNotEmpty({ message: 'Tên món ăn không được để trống' })
  @IsString({ message: 'Tên món ăn phải là chuỗi' })
  name: string;

  @IsNotEmpty({ message: 'Giá món ăn không được để trống' })
  @IsNumber({}, { message: 'Giá món ăn phải là số' })
  @Min(0, { message: 'Giá món ăn không được nhỏ hơn 0' })
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty({ message: 'Danh mục món ăn không được để trống' })
  @IsUUID('4', { message: 'Mã danh mục không hợp lệ' })
  categoryId: string;
}
```

---

## 4. Database & Prisma Schema (`prisma/schema/*.prisma`)

**Nhiệm vụ:** Định nghĩa cấu trúc bảng trong PostgreSQL thông qua mô hình schema phân chia nhiều file:
- `_base.prisma`: Datasource & Client generator.
- `address.prisma`: Địa giới hành chính (`provinces`, `wards`).
- `auth.prisma`: Tài khoản (`users`), phiên đăng nhập (`refresh_tokens`), phân quyền (`Role`).
- `branch.prisma`: Chi nhánh (`restaurant_branches`), giờ hoạt động (`branch_operating_hours`).
- `menu.prisma`: Danh mục (`menu_categories`), món ăn (`menu_items`), chi tiết theo chi nhánh (`branch_menu_items`).
- `table.prisma`: Loại bàn (`table_types`), bàn tại chi nhánh (`restaurant_tables`).

### Quy tắc:
- Khóa chính luôn dùng `UUID` (`id String @id @default(uuid()) @db.Uuid`).
- Khóa ngoại dạng `<domain>Id` (ví dụ: `branchId`, `categoryId`, `tableTypeId`).
- Tên bảng database dùng số nhiều snake_case qua `@@map("table_names")`.
- Luôn có timestamp: `createdAt DateTime @default(now())` và `updatedAt DateTime @updatedAt`.
- Giá tiền dùng `Decimal @db.Decimal(12, 2)`.

---

## 5. Chuẩn hóa Response & Error Response

### 5.1 Success Response (`TransformInterceptor`)
Tất cả response trả về từ Controller được tự động chuẩn hóa qua interceptor:
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": { ... }
}
```

### 5.2 Error Response (`Global HttpExceptionFilter`)
Khi Service ném ra Exception, filter tự động bắt và trả về format đồng nhất:
```json
{
  "statusCode": 400,
  "message": "Thông tin đặt bàn không hợp lệ",
  "error": "Bad Request",
  "timestamp": "2026-10-23T10:00:00.000Z"
}
```

---

## 6. Chống trùng lặp code (Duplicate Prevention)

- **Search first:** Trước khi tạo helper function hay service method mới, kiểm tra các modules đã có trong `src/core/`, `src/utils/` và `src/modules/`.
- **Inject, don't duplicate:** Sử dụng `PrismaService`, `RedisService`, `MailService` có sẵn thay vì kết nối lại client mới.
