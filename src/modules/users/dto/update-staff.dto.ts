import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateStaffDto {
  @ApiPropertyOptional({ description: 'Họ và tên nhân viên', example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  fullName?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại', example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Giới tính', enum: Gender, example: Gender.MALE })
  @IsOptional()
  @IsEnum(Gender, { message: 'Giới tính không hợp lệ' })
  gender?: Gender;

  @ApiPropertyOptional({ description: 'ID chi nhánh làm việc (dùng khi điều chuyển)', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsUUID('4', { message: 'ID chi nhánh không hợp lệ' })
  branchId?: string;

  @ApiPropertyOptional({ description: 'Trạng thái hoạt động', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
