import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

const RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000; // Mỗi 6 giờ dọn 1 lần
const READ_RETENTION_DAYS = 30;
const UNREAD_RETENTION_DAYS = 90;

@Injectable()
export class NotificationRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationRetentionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.timer = setInterval(() => {
      void this.cleanupOldNotifications();
    }, RETENTION_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async cleanupOldNotifications(): Promise<number> {
    try {
      const now = Date.now();
      const readCutoff = new Date(now - READ_RETENTION_DAYS * 86_400_000);
      const unreadCutoff = new Date(now - UNREAD_RETENTION_DAYS * 86_400_000);

      const res = await this.prisma.notification.deleteMany({
        where: {
          OR: [
            { readAt: { not: null }, createdAt: { lt: readCutoff } },
            { readAt: null, createdAt: { lt: unreadCutoff } },
          ],
        },
      });

      if (res.count > 0) {
        this.logger.log(`Đã dọn ${res.count} thông báo cũ quá thời hạn lưu trữ.`);
      }
      return res.count;
    } catch (err) {
      this.logger.warn('[NotificationRetention] Dọn thông báo cũ thất bại:', err);
      return 0;
    }
  }
}
