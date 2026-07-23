import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { ReportFormat } from '@cqp/core';

const REPORT_FORMATS: ReportFormat[] = ['html', 'pdf', 'json', 'sarif'];

export class GenerateReportRequestDto {
  @ApiProperty({ enum: REPORT_FORMATS })
  @IsIn(REPORT_FORMATS)
  format!: ReportFormat;
}
