import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { QaAutomationEnvironment } from '@cqp/core';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';

const QA_AUTOMATION_ENVIRONMENTS: QaAutomationEnvironment[] = ['production', 'staging'];

/** Org-wide run history, optionally filtered to a single environment (docs/adr/0036) — defaults to 'production' at the controller so existing callers see unchanged behavior. */
export class ListQaAutomationRunsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: QA_AUTOMATION_ENVIRONMENTS })
  @IsOptional()
  @IsIn(QA_AUTOMATION_ENVIRONMENTS)
  environment?: QaAutomationEnvironment;
}
