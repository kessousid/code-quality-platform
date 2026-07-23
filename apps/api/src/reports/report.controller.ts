import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ReportFormat } from '@cqp/core';
import {
  GenerateReportUseCase,
  GetReportContentUseCase,
  GetReportUseCase,
  ListReportsByScanUseCase,
  ReportNotFoundError,
} from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { GenerateReportRequestDto } from './dto/generate-report.dto.js';

const CONTENT_TYPE: Record<ReportFormat, string> = {
  json: 'application/json',
  sarif: 'application/sarif+json',
  html: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
};

@ApiBearerAuth()
@ApiTags('reports')
@Controller()
export class ReportController {
  constructor(
    private readonly listReportsByScanUseCase: ListReportsByScanUseCase,
    private readonly getReportUseCase: GetReportUseCase,
    private readonly generateReportUseCase: GenerateReportUseCase,
    private readonly getReportContentUseCase: GetReportContentUseCase,
  ) {}

  @Get('scans/:scanId/reports')
  async listByScan(@CurrentOrg() orgId: string, @Param('scanId') scanId: string) {
    return this.listReportsByScanUseCase.execute(orgId, scanId);
  }

  @Post('scans/:scanId/reports')
  async generate(
    @CurrentOrg() orgId: string,
    @Param('scanId') scanId: string,
    @Body() dto: GenerateReportRequestDto,
  ) {
    return this.generateReportUseCase.execute(orgId, scanId, dto.format);
  }

  @Get('reports/:id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getReportUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof ReportNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get('reports/:id/content')
  async getContent(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    let content: Buffer;
    let contentType: string;
    try {
      const result = await this.getReportContentUseCase.execute(orgId, id);
      content = result.content;
      contentType = CONTENT_TYPE[result.report.format];
    } catch (error) {
      if (error instanceof ReportNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }

    // Plain @Res() (not passthrough) — Nest's passthrough return-value
    // serialization JSON-stringifies a Buffer into `{type, data}` instead
    // of sending raw bytes. Send it directly so the real content type
    // (json/sarif/html/pdf) and real bytes reach the client unmodified.
    res.status(200).setHeader('Content-Type', contentType).send(content);
  }
}
