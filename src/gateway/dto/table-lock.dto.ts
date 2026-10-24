import { IsNotEmpty, IsUUID } from 'class-validator';

export class TableLockDto {
  @IsUUID('all', { message: 'tableId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'tableId không được để trống' })
  tableId: string;

  @IsUUID('all', { message: 'branchId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'branchId không được để trống' })
  branchId: string;
}

export class BranchJoinDto {
  @IsUUID('all', { message: 'branchId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'branchId không được để trống' })
  branchId: string;
}
