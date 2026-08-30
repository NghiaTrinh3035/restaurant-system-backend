import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MenusModule } from './modules/menus/menus.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { TablesModule } from './modules/tables/tables.module';
import { RedisModule } from './redis/redis.module';
import { JwtAuthGuard } from './core/common/guards/jwt-auth.guard';
import { AuthJwtModule } from './core/security/jwt/jwt.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,  // 1 phút
        limit: 100,  // Giới hạn 100 requests / 1 phút cho toàn hệ thống
      },
      {
        name: 'short',
        ttl: 1000,   // 1 giây
        limit: 10,   // Giới hạn 10 requests / 1 giây chống spam click
      },
    ]),
    RedisModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    MenusModule,
    PaymentsModule,
    ReservationsModule,
    RestaurantsModule,
    ReviewsModule,
    TablesModule,
    AuthJwtModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule { }
