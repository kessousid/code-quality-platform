import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { RepoProvider } from '@cqp/core';

const REPO_PROVIDERS: RepoProvider[] = ['local', 'github', 'gitlab'];

export class CreateRepoRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: REPO_PROVIDERS, required: false })
  @IsOptional()
  @IsIn(REPO_PROVIDERS)
  provider?: RepoProvider;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remoteUrl?: string;

  @ApiProperty({
    required: false,
    description:
      "Absolute path on the worker's filesystem — required for a scan to actually run (see docs/adr/0021). No clone-from-remote exists yet.",
  })
  @IsOptional()
  @IsString()
  localPath?: string;

  @ApiProperty({
    required: false,
    description:
      "Which worker instance's filesystem localPath actually lives on (see docs/adr/0031) — routes every job for this repo to that worker only. Defaults to 'default', the single-machine setup.",
  })
  @IsOptional()
  @IsString()
  workerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  defaultBranch?: string;
}
