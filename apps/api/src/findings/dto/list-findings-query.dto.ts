import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { AnalysisCategory, Finding, Severity } from '@cqp/core';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const STATUSES: Finding['status'][] = ['open', 'fixed', 'ignored', 'false-positive'];
const CATEGORIES: AnalysisCategory[] = [
  'code-quality',
  'security',
  'dependency-vulnerability',
  'secret-detection',
  'architecture',
  'performance',
  'database',
  'devops-iac',
  'test-coverage',
  'documentation',
  'best-practices',
  'technical-debt',
];

/** See docs/adr/0015-pagination-and-filtering.md — every filter optional, validated against the same enums the domain defines. */
export class ListFindingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  repoId?: string;

  @ApiPropertyOptional({ enum: SEVERITIES })
  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: Severity;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: Finding['status'];

  @ApiPropertyOptional({ enum: CATEGORIES })
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: AnalysisCategory;
}
