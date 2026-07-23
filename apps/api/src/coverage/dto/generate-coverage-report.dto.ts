import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { CoverageReportFormat } from '@cqp/core';

const COVERAGE_REPORT_FORMATS: CoverageReportFormat[] = ['json', 'html', 'pdf'];

export class GenerateCoverageReportRequestDto {
  @ApiProperty({ enum: COVERAGE_REPORT_FORMATS })
  @IsIn(COVERAGE_REPORT_FORMATS)
  format!: CoverageReportFormat;
}
