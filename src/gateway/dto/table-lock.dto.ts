import { IsInt, IsNotEmpty, IsOptional, IsUUID, Matches, Min } from 'class-validator';

export class TableLockDto {
  @IsUUID('all', { message: 'tableId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'tableId không được để trống' })
  tableId: string;

  @IsUUID('all', { message: 'branchId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'branchId không được để trống' })
  branchId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date phải có định dạng YYYY-MM-DD' })
  date: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time phải có định dạng HH:mm' })
  time: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  guestCount?: number;
}

export class BranchJoinDto {
  @IsUUID('all', { message: 'branchId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'branchId không được để trống' })
  branchId: string;
}
