import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { UnitTestReportFormat } from '@cqp/core';

const UNIT_TEST_REPORT_FORMATS: UnitTestReportFormat[] = ['json', 'html', 'pdf'];

export class GenerateUnitTestReportRequestDto {
  @ApiProperty({ enum: UNIT_TEST_REPORT_FORMATS })
  @IsIn(UNIT_TEST_REPORT_FORMATS)
  format!: UnitTestReportFormat;
}
