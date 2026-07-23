import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { TestGeneratorType } from '@cqp/core';

const TEST_GENERATOR_TYPES: TestGeneratorType[] = ['gemini', 'script'];

export class UnitTestTargetDto {
  @ApiProperty({ description: "A file or directory, relative to the repo's local checkout root." })
  @IsString()
  @IsNotEmpty()
  path!: string;

  @ApiProperty({
    required: false,
    description:
      'Narrows generation to one exported function within `path` — requires `path` to be a file.',
  })
  @IsOptional()
  @IsString()
  functionName?: string;
}

export class CreateUnitTestRunRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  repoId!: string;

  @ApiProperty({ type: UnitTestTargetDto })
  @ValidateNested()
  @Type(() => UnitTestTargetDto)
  target!: UnitTestTargetDto;

  @ApiProperty({
    required: false,
    enum: TEST_GENERATOR_TYPES,
    description:
      "Which JestTestGenerator writes this run's tests — defaults to Gemini when omitted (docs/adr/0026).",
  })
  @IsOptional()
  @IsIn(TEST_GENERATOR_TYPES)
  generator?: TestGeneratorType;
}
