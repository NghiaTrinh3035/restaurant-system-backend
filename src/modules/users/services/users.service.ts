import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateUserProfileRequest } from '../dto/user-profile.dto';
import { CustomException } from 'src/core/exceptions/custom.exception';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
        omit: {
          passwordHash: true
        }
      })
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
}
