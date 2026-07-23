import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { AnalysisCategory, ScanMode } from '@cqp/core';

const SCAN_MODES: ScanMode[] = ['full', 'incremental'];

/** The 5 categories the built-in plugins actually produce — see docs/adr/0023 (the other 7 AnalysisCategory values have no plugin yet). */
const SCAN_CATEGORIES: AnalysisCategory[] = [
  'security',
  'code-quality',
  'secret-detection',
  'dependency-vulnerability',
  'architecture',
];

/**
 * Phase 6: orgId is gone from this DTO entirely — it now comes from
 * @CurrentOrg() (the validated auth token), never from client input. See
 * docs/adr/0014-auth-model.md; this retires the gap Phase 5 flagged.
 */
export class CreateScanRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  repoId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ref!: string;

  @ApiProperty({ enum: SCAN_MODES })
  @IsIn(SCAN_MODES)
  mode!: ScanMode;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  baseScanId?: string;

  @ApiProperty({
    enum: SCAN_CATEGORIES,
    isArray: true,
    required: false,
    description: 'Which plugin categories to run. Omit/empty to run every applicable plugin.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(SCAN_CATEGORIES, { each: true })
  categories?: AnalysisCategory[];
}
