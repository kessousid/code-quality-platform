import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CoverageReportFormat } from '@cqp/core';
import {
  CoverageReportNotFoundError,
  GenerateCoverageReportUseCase,
  GetCoverageReportContentUseCase,
  GetCoverageReportUseCase,
  ListCoverageReportsByRunUseCase,
} from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { GenerateCoverageReportRequestDto } from './dto/generate-coverage-report.dto.js';

const CONTENT_TYPE: Record<CoverageReportFormat, string> = {
  json: 'application/json',
  html: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
};

/** Mirrors UnitTestReportController exactly (docs/adr/0019, docs/adr/0024, docs/adr/0025) — see docs/adr/0019's note on why `@Res()` here is never passthrough: that mode JSON-serializes a returned Buffer into `{type,data}` instead of sending raw bytes. */
@ApiBearerAuth()
@ApiTags('coverage-reports')
@Controller()
export class CoverageReportController {
  constructor(
    private readonly listCoverageReportsByRunUseCase: ListCoverageReportsByRunUseCase,
    private readonly getCoverageReportUseCase: GetCoverageReportUseCase,
    private readonly generateCoverageReportUseCase: GenerateCoverageReportUseCase,
    private readonly getCoverageReportContentUseCase: GetCoverageReportContentUseCase,
  ) {}

  @Get('coverage-runs/:runId/reports')
  async listByRun(@CurrentOrg() orgId: string, @Param('runId') runId: string) {
    return this.listCoverageReportsByRunUseCase.execute(orgId, runId);
  }

  @Post('coverage-runs/:runId/reports')
  async generate(
    @CurrentOrg() orgId: string,
    @Param('runId') runId: string,
    @Body() dto: GenerateCoverageReportRequestDto,
  ) {
    return this.generateCoverageReportUseCase.execute(orgId, runId, dto.format);
  }

  @Get('coverage-reports/:id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getCoverageReportUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof CoverageReportNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get('coverage-reports/:id/content')
  async getContent(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    let content: Buffer;
    let contentType: string;
    try {
      const result = await this.getCoverageReportContentUseCase.execute(orgId, id);
      content = result.content;
      contentType = CONTENT_TYPE[result.report.format];
    } catch (error) {
      if (error instanceof CoverageReportNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }

    res.status(200).setHeader('Content-Type', contentType).send(content);
  }
}
