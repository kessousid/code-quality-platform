import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { UnitTestReportFormat } from '@cqp/core';
import {
  GenerateUnitTestReportUseCase,
  GetUnitTestReportContentUseCase,
  GetUnitTestReportUseCase,
  ListUnitTestReportsByRunUseCase,
  UnitTestReportNotFoundError,
} from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { GenerateUnitTestReportRequestDto } from './dto/generate-unit-test-report.dto.js';

const CONTENT_TYPE: Record<UnitTestReportFormat, string> = {
  json: 'application/json',
  html: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Mirrors ReportController exactly (docs/adr/0019, docs/adr/0024) — see docs/adr/0019's note on why `@Res()` here is never passthrough: that mode JSON-serializes a returned Buffer into `{type,data}` instead of sending raw bytes. */
@ApiBearerAuth()
@ApiTags('unit-test-reports')
@Controller()
export class UnitTestReportController {
  constructor(
    private readonly listUnitTestReportsByRunUseCase: ListUnitTestReportsByRunUseCase,
    private readonly getUnitTestReportUseCase: GetUnitTestReportUseCase,
    private readonly generateUnitTestReportUseCase: GenerateUnitTestReportUseCase,
    private readonly getUnitTestReportContentUseCase: GetUnitTestReportContentUseCase,
  ) {}

  @Get('unit-tests/:runId/reports')
  async listByRun(@CurrentOrg() orgId: string, @Param('runId') runId: string) {
    return this.listUnitTestReportsByRunUseCase.execute(orgId, runId);
  }

  @Post('unit-tests/:runId/reports')
  async generate(
    @CurrentOrg() orgId: string,
    @Param('runId') runId: string,
    @Body() dto: GenerateUnitTestReportRequestDto,
  ) {
    return this.generateUnitTestReportUseCase.execute(orgId, runId, dto.format);
  }

  @Get('unit-test-reports/:id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getUnitTestReportUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof UnitTestReportNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get('unit-test-reports/:id/content')
  async getContent(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    let content: Buffer;
    let contentType: string;
    try {
      const result = await this.getUnitTestReportContentUseCase.execute(orgId, id);
      content = result.content;
      contentType = CONTENT_TYPE[result.report.format];
    } catch (error) {
      if (error instanceof UnitTestReportNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }

    res.status(200).setHeader('Content-Type', contentType).send(content);
  }
}
