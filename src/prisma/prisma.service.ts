import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const MAX_CONNECT_RETRIES = 3;
const CONNECT_RETRY_DELAY_MS = 2000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      transactionOptions: {
        maxWait: 10000,
        timeout: 15000,
      },
    });
  }

  async onModuleInit() {
    for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === MAX_CONNECT_RETRIES) {
          throw error;
        }
        this.logger.warn(
          `Kết nối PostgreSQL thất bại (lần ${attempt}/${MAX_CONNECT_RETRIES}): ${message}. Thử lại sau ${CONNECT_RETRY_DELAY_MS}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAY_MS));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}