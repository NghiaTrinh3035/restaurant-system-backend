import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateUserProfileRequest } from '../dto/user-profile.dto';
import { CreateStaffDto } from '../dto/create-staff.dto';
import { UpdateStaffDto } from '../dto/update-staff.dto';
import { QueryStaffDto } from '../dto/query-staff.dto';
import { ResetStaffPasswordDto } from '../dto/reset-staff-password.dto';
import { CustomException } from 'src/core/exceptions/custom.exception';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            status: true,
          }
        }
      },
      omit: {
        passwordHash: true
      }
    });
    if (!user) {
      throw new CustomException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'Không tìm thấy người dùng');
    }
    return user;
  }

  async updateProfile(userId: string, data: UpdateUserProfileRequest) {
    try {
      return await this.prisma.user.update({
        where: {
          id: userId
        },
        data,
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              address: true,
              status: true,
            }
          }
        },
        omit: {
          passwordHash: true
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new CustomException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'Không tìm thấy người dùng');
      }
      throw error;
    }
  }

  // ==================== STAFF MANAGEMENT METHODS ====================

  /**
   * Lấy danh sách nhân viên (Role = STAFF) có phân trang, lọc theo chi nhánh, trạng thái & tìm kiếm
   */
  async getStaffs(query: QueryStaffDto) {
    const { page = 1, limit = 10, search, branchId, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: Role.STAFF,
      ...(branchId && { branchId }),
      ...(typeof isActive === 'boolean' && { isActive }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              address: true,
              status: true,
            },
          },
        },
        omit: {
          passwordHash: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Xem chi tiết nhân viên theo ID
   */
  async getStaffById(id: string) {
    const staff = await this.prisma.user.findFirst({
      where: { id, role: Role.STAFF },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            status: true,
          },
        },
      },
      omit: {
        passwordHash: true,
      },
    });

    if (!staff) {
      throw new CustomException(HttpStatus.NOT_FOUND, 'STAFF_NOT_FOUND', 'Không tìm thấy nhân viên');
    }

    return staff;
  }

  /**
   * Tạo tài khoản nhân viên mới gán vào chi nhánh
   */
  async createStaff(data: CreateStaffDto) {
    const normalizedEmail = data.email.trim().toLowerCase();

    // 1. Kiểm tra email đã tồn tại chưa
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new CustomException(HttpStatus.CONFLICT, 'EMAIL_EXISTS', 'Email này đã được sử dụng trong hệ thống');
    }

    // 2. Kiểm tra chi nhánh tồn tại
    const branch = await this.prisma.restaurantBranch.findUnique({
      where: { id: data.branchId },
    });
    if (!branch) {
      throw new CustomException(HttpStatus.BAD_REQUEST, 'BRANCH_NOT_FOUND', 'Chi nhánh được chỉ định không tồn tại');
    }

    // 3. Hash mật khẩu
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    // 4. Tạo User role STAFF
    return await this.prisma.user.create({
      data: {
        fullName: data.fullName.trim(),
        email: normalizedEmail,
        passwordHash,
        phone: data.phone?.trim() || null,
        gender: data.gender || null,
        branchId: data.branchId,
        role: Role.STAFF,
        isActive: true,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            status: true,
          },
        },
      },
      omit: {
        passwordHash: true,
      },
    });
  }

  /**
   * Cập nhật thông tin nhân viên hoặc điều chuyển chi nhánh
   */
  async updateStaff(id: string, data: UpdateStaffDto) {
    // 1. Kiểm tra nhân viên tồn tại
    await this.getStaffById(id);

    // 2. Nếu có thay đổi chi nhánh, kiểm tra chi nhánh mới có tồn tại không
    if (data.branchId) {
      const branch = await this.prisma.restaurantBranch.findUnique({
        where: { id: data.branchId },
      });
      if (!branch) {
        throw new CustomException(HttpStatus.BAD_REQUEST, 'BRANCH_NOT_FOUND', 'Chi nhánh chuyển đến không tồn tại');
      }
    }

    return await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.fullName !== undefined && { fullName: data.fullName.trim() }),
        ...(data.phone !== undefined && { phone: data.phone ? data.phone.trim() : null }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.branchId !== undefined && { branchId: data.branchId }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            status: true,
          },
        },
      },
      omit: {
        passwordHash: true,
      },
    });
  }

  /**
   * Bật/Tắt trạng thái hoạt động của nhân viên (Khóa tài khoản / Kích hoạt lại)
   * Khi khóa, tự động xóa sạch refresh token để force logout
   */
  async toggleStaffStatus(id: string) {
    const staff = await this.getStaffById(id);
    const newStatus = !staff.isActive;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: newStatus },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            status: true,
          },
        },
      },
      omit: {
        passwordHash: true,
      },
    });

    // Nếu khóa tài khoản, thu hồi toàn bộ session đăng nhập
    if (!newStatus) {
      await this.prisma.refreshToken.deleteMany({
        where: { userId: id },
      });
    }

    return updated;
  }

  /**
   * Đặt lại mật khẩu mới cho nhân viên
   */
  async resetStaffPassword(id: string, data: ResetStaffPasswordDto) {
    await this.getStaffById(id);

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.newPassword, salt);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    // Thu hồi toàn bộ refresh token cũ để nhân viên đăng nhập lại bằng mật khẩu mới
    await this.prisma.refreshToken.deleteMany({
      where: { userId: id },
    });

    return { success: true, message: 'Đặt lại mật khẩu cho nhân viên thành công' };
  }
}
