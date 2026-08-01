import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { QaAutomationReportFormat } from '@cqp/core';
import {
  GenerateQaAutomationReportUseCase,
  GetQaAutomationReportContentUseCase,
  GetQaAutomationReportUseCase,
  ListQaAutomationReportsByRunUseCase,
  QaAutomationReportNotFoundError,
} from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { GenerateQaAutomationReportRequestDto } from './dto/generate-qa-automation-report.dto.js';

const CONTENT_TYPE: Record<QaAutomationReportFormat, string> = {
  pdf: 'application/pdf',
};

/** Mirrors UnitTestReportController exactly (see its own note on why `@Res()` here is never passthrough). */
@ApiBearerAuth()
@ApiTags('qa-automation-reports')
@Controller()
export class QaAutomationReportController {
  constructor(
    private readonly listQaAutomationReportsByRunUseCase: ListQaAutomationReportsByRunUseCase,
    private readonly getQaAutomationReportUseCase: GetQaAutomationReportUseCase,
    private readonly generateQaAutomationReportUseCase: GenerateQaAutomationReportUseCase,
    private readonly getQaAutomationReportContentUseCase: GetQaAutomationReportContentUseCase,
  ) {}

  @Get('qa-automation/runs/:runId/reports')
  async listByRun(@CurrentOrg() orgId: string, @Param('runId') runId: string) {
    return this.listQaAutomationReportsByRunUseCase.execute(orgId, runId);
  }

  @Post('qa-automation/runs/:runId/reports')
  async generate(
    @CurrentOrg() orgId: string,
    @Param('runId') runId: string,
    @Body() dto: GenerateQaAutomationReportRequestDto,
  ) {
    return this.generateQaAutomationReportUseCase.execute(orgId, runId, dto.format);
  }

  @Get('qa-automation-reports/:id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getQaAutomationReportUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof QaAutomationReportNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get('qa-automation-reports/:id/content')
  async getContent(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    let content: Buffer;
    let contentType: string;
    try {
      const result = await this.getQaAutomationReportContentUseCase.execute(orgId, id);
      content = result.content;
      contentType = CONTENT_TYPE[result.report.format];
    } catch (error) {
      if (error instanceof QaAutomationReportNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }

    res.status(200).setHeader('Content-Type', contentType).send(content);
  }
}
