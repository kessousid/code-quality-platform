import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

/** Mirrors ListScansQueryDto — no "list every run across the org" use case yet, only per-repo history. */
export class ListUnitTestRunsQueryDto extends PaginationQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  repoId!: string;
}
