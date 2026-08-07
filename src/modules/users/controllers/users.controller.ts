import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Req, UseGuards } from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { UpdateUserProfileRequest } from '../dto/user-profile.dto';
import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { AuthRequest } from 'src/core/common/interfaces/auth.interface';
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) { }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy thông tin người dùng thành công')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: AuthRequest) {
    return this.usersService.me(req.user.id);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cập nhật hồ sơ thành công')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Req() req: AuthRequest,
    @Body() body: UpdateUserProfileRequest,
  ) {
    return this.usersService.updateProfile(
      req.user.id,
      body,
    );
  }
}
