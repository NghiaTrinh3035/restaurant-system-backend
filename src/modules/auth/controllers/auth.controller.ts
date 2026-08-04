import { Body, Controller, HttpCode, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
// import { ForgotPasswordDto } from '../dto/forgot-password.dto';
// import { ResetPasswordDto } from '../dto/reset-password.dto';
// import { ChangePasswordDto } from '../dto/change-password.dto';
// import { GoogleAuthGuard } from '../guards/google-auth.guard';
// import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from 'src/core/common/decorators/public.decorator';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @ResponseMessage('Register successfully')
    @Post('register')
    @HttpCode(201)
    async register(@Body() body: RegisterDto) {
        return this.authService.register(body);
    }

    @Public()
    @ResponseMessage('Login successfully')
    @Post('login')
    async login(@Body() body: LoginDto) {
        return this.authService.login(body);
    }

    //   @Public()
    //   @Post('forgot-password')
    //   async forgotPassword(@Body() body: ForgotPasswordDto) {
    //     return this.authService.forgotPassword(body.email);
    //   }

    //   @Public()
    //   @Post('reset-password')
    //   async resetPassword(@Body() body: ResetPasswordDto) {
    //     return this.authService.resetPassword(body.token, body.newPassword);
    //   }

    //   @UseGuards(JwtAuthGuard)
    //   @Post('change-password')
    //   async changePassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    //     return this.authService.changePassword(req.user.sub, body.oldPassword, body.newPassword);
    //   }

    //   @Public()
    //   @Get('google')
    //   @UseGuards(GoogleAuthGuard)
    //   async googleAuth(@Req() req) {}

    //   @Public()
    //   @Get('google/callback')
    //   @UseGuards(GoogleAuthGuard)
    //   async googleAuthCallback(@Req() req) {
    //     return this.authService.googleLogin(req.user);
    //   }
}
