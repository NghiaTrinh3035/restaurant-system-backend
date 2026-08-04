import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from '../dtos/register.dto';
import * as bcrypt from 'bcrypt';
import { AuthProvider, Role, User } from '@prisma/client';
import { LoginDto } from '../dtos/login.dto';


@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {
  }

  async register(data: RegisterDto): Promise<Omit<User, 'passwordHash'>> {
    // 1. Check nếu email đã tồn tại
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email }
    });
    if (existingUser) {
      throw new ConflictException('Email đã tồn tại');
    }

    // 2. Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // 3. Tạo user mới (mặc định là role USER)
    const newUser = await this.prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        phone: data.phone,
        passwordHash: hashedPassword,
        provider: AuthProvider.LOCAL,
        role: Role.USER,
        isActive: true,

      },
    });
    // Không return user raw có password, chỉ return info cơ bản
    const { passwordHash, ...safeUser } = newUser;
    return safeUser;
  }

  async login(data: LoginDto): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email }
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    // Không return user raw có password, chỉ return info cơ bản
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
