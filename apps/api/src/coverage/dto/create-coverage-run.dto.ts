import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCoverageRunRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  repoId!: string;

  @ApiProperty({
    required: false,
    description:
      "Defaults to the repo's defaultBranch when omitted. Must resolve locally (git rev-parse --verify).",
  })
  @IsOptional()
  @IsString()
  baseRef?: string;
}
