import { PartialType } from '@nestjs/swagger';
import { CreateTableTypeDto } from './table-type.dto';

export class UpdateTableTypeDto extends PartialType(CreateTableTypeDto) {}
