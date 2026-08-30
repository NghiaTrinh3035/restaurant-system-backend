import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { UpdateUserProfileRequest } from '../dto/user-profile.dto';
import { CreateStaffDto } from '../dto/create-staff.dto';
import { UpdateStaffDto } from '../dto/update-staff.dto';
import { QueryStaffDto } from '../dto/query-staff.dto';
import { ResetStaffPasswordDto } from '../dto/reset-staff-password.dto';
import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/common/guards/roles.guard';
import { Roles } from 'src/core/common/decorators/roles.decorator';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { CurrentUser } from 'src/core/common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Users & Staff')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy thông tin người dùng thành công')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy thông tin cá nhân của người dùng hiện tại' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.me(userId);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cập nhật hồ sơ thành công')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cập nhật thông tin cá nhân của người dùng hiện tại' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() body: UpdateUserProfileRequest,
  ) {
    return this.usersService.updateProfile(userId, body);
  }

  // ==================== ADMIN STAFF MANAGEMENT APIS ====================

  @Get('staff')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy danh sách nhân viên thành công')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin lấy danh sách nhân viên toàn chuỗi hoặc theo chi nhánh' })
  async getStaffs(@Query() query: QueryStaffDto) {
    return this.usersService.getStaffs(query);
  }

  @Get('staff/:id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy chi tiết nhân viên thành công')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin xem chi tiết nhân viên' })
  async getStaffById(@Param('id') id: string) {
    return this.usersService.getStaffById(id);
  }

  @Post('staff')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Tạo tài khoản nhân viên thành công')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin tạo tài khoản nhân viên mới gán vào chi nhánh' })
  async createStaff(@Body() body: CreateStaffDto) {
    return this.usersService.createStaff(body);
  }

  @Patch('staff/:id')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cập nhật thông tin nhân viên thành công')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin cập nhật thông tin hoặc điều chuyển chi nhánh nhân viên' })
  async updateStaff(
    @Param('id') id: string,
    @Body() body: UpdateStaffDto,
  ) {
    return this.usersService.updateStaff(id, body);
  }

  @Patch('staff/:id/toggle-status')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Thay đổi trạng thái hoạt động của nhân viên thành công')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin khóa hoặc kích hoạt lại tài khoản nhân viên' })
  async toggleStaffStatus(@Param('id') id: string) {
    return this.usersService.toggleStaffStatus(id);
  }

  @Post('staff/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đặt lại mật khẩu cho nhân viên thành công')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin đặt lại mật khẩu mới cho nhân viên' })
  async resetStaffPassword(
    @Param('id') id: string,
    @Body() body: ResetStaffPasswordDto,
  ) {
    return this.usersService.resetStaffPassword(id, body);
  }
}
