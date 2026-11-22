import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';

export class InAppPreferencesDto {
  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  reservation?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  pickup?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  kitchen?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  payment?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  security?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  account?: boolean;
}

export class EmailPreferencesDto {
  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  reservation?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  pickup?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ type: InAppPreferencesDto })
  @ValidateNested()
  @Type(() => InAppPreferencesDto)
  @IsOptional()
  inApp?: InAppPreferencesDto;

  @ApiPropertyOptional({ type: EmailPreferencesDto })
  @ValidateNested()
  @Type(() => EmailPreferencesDto)
  @IsOptional()
  email?: EmailPreferencesDto;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  soundEnabled?: boolean;
}

export interface NotificationPreferences {
  inApp: {
    reservation: boolean;
    pickup: boolean;
    kitchen: boolean;
    payment: boolean;
    security: boolean;
    account: boolean;
  };
  email: {
    reservation: boolean;
    pickup: boolean;
  };
  soundEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inApp: {
    reservation: true,
    pickup: true,
    kitchen: true,
    payment: true,
    security: true,
    account: true,
  },
  email: {
    reservation: true,
    pickup: true,
  },
  soundEnabled: true,
};

export function mergeNotificationPreferences(raw: unknown): NotificationPreferences {
  const input =
    raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const inApp =
    input.inApp && typeof input.inApp === 'object' ? input.inApp : {};
  const email =
    input.email && typeof input.email === 'object' ? input.email : {};

  return {
    inApp: {
      reservation:
        typeof inApp.reservation === 'boolean'
          ? inApp.reservation
          : DEFAULT_NOTIFICATION_PREFERENCES.inApp.reservation,
      pickup:
        typeof inApp.pickup === 'boolean'
          ? inApp.pickup
          : DEFAULT_NOTIFICATION_PREFERENCES.inApp.pickup,
      kitchen:
        typeof inApp.kitchen === 'boolean'
          ? inApp.kitchen
          : DEFAULT_NOTIFICATION_PREFERENCES.inApp.kitchen,
      payment:
        typeof inApp.payment === 'boolean'
          ? inApp.payment
          : DEFAULT_NOTIFICATION_PREFERENCES.inApp.payment,
      security:
        typeof inApp.security === 'boolean'
          ? inApp.security
          : DEFAULT_NOTIFICATION_PREFERENCES.inApp.security,
      account:
        typeof inApp.account === 'boolean'
          ? inApp.account
          : DEFAULT_NOTIFICATION_PREFERENCES.inApp.account,
    },
    email: {
      reservation:
        typeof email.reservation === 'boolean'
          ? email.reservation
          : DEFAULT_NOTIFICATION_PREFERENCES.email.reservation,
      pickup:
        typeof email.pickup === 'boolean'
          ? email.pickup
          : DEFAULT_NOTIFICATION_PREFERENCES.email.pickup,
    },
    soundEnabled:
      typeof input.soundEnabled === 'boolean'
        ? input.soundEnabled
        : DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled,
  };
}
