import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/core/common/decorators/current-user.decorator';
import { ResponseMessage } from 'src/core/common/decorators/response-message.decorator';
import { JwtAuthGuard } from 'src/core/common/guards/jwt-auth.guard';
import type { ICurrentUser } from 'src/core/common/interfaces/current-user.interface';
import { UpdateNotificationPreferencesDto } from '../dtos/notification-preferences.dto';
import { QueryNotificationsDto } from '../dtos/query-notifications.dto';
import { NotificationsService } from '../services/notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy danh sách thông báo thành công.')
  async getMyNotifications(
    @CurrentUser() user: ICurrentUser,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.getMyNotifications(user.id, query);
  }

  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy số lượng thông báo chưa đọc thành công.')
  async getUnreadCount(@CurrentUser() user: ICurrentUser) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Get('preferences')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Lấy cài đặt thông báo thành công.')
  async getPreferences(@CurrentUser() user: ICurrentUser) {
    return this.notificationsService.getPreferences(user.id);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Cập nhật cài đặt thông báo thành công.')
  async updatePreferences(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(user.id, dto);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đã đánh dấu đọc tất cả thông báo.')
  async markAllAsRead(@CurrentUser() user: ICurrentUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đã đánh dấu thông báo là đã đọc.')
  async markAsRead(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.notificationsService.markAsRead(id, user.id);
  }
}
