import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Req, UseGuards } from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { UpdateUserProfileRequest } from '../dto/user-profile.dto';
import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { CurrentUser } from 'src/core/common/decorators/current-user.decorator';
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) { }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy thông tin người dùng thành công')
  @UseGuards(JwtAuthGuard)
  async getMe(
    @CurrentUser('id') userId: string,
  ) {
    return this.usersService.me(userId);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cập nhật hồ sơ thành công')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() body: UpdateUserProfileRequest,
  ) {
    return this.usersService.updateProfile(
      userId,
      body,
    );
  }
}
