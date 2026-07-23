import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

/** repoId is required — there is no "list every scan across the org" use case yet, only per-repo history. */
export class ListScansQueryDto extends PaginationQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  repoId!: string;
}
