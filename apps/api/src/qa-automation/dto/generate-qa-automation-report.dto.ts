import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { QaAutomationReportFormat } from '@cqp/core';

const QA_AUTOMATION_REPORT_FORMATS: QaAutomationReportFormat[] = ['pdf', 'xlsx'];

export class GenerateQaAutomationReportRequestDto {
  @ApiProperty({ enum: QA_AUTOMATION_REPORT_FORMATS })
  @IsIn(QA_AUTOMATION_REPORT_FORMATS)
  format!: QaAutomationReportFormat;
}
