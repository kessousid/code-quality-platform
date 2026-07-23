import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ReportSummary } from '@cqp/reporting';
import {
  CancelScanUseCase,
  CreateScanUseCase,
  GetScanSummaryUseCase,
  GetScanUseCase,
  ListFindingsByScanUseCase,
  ListScansByRepoUseCase,
  RepoNotFoundError,
  ScanNotFoundError,
} from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { CreateScanRequestDto } from './dto/create-scan.dto.js';
import { ListScansQueryDto } from './dto/list-scans-query.dto.js';

@ApiBearerAuth()
@ApiTags('scans')
@Controller('scans')
export class ScanController {
  constructor(
    private readonly createScanUseCase: CreateScanUseCase,
    private readonly getScanUseCase: GetScanUseCase,
    private readonly listScansByRepoUseCase: ListScansByRepoUseCase,
    private readonly getScanSummaryUseCase: GetScanSummaryUseCase,
    private readonly listFindingsByScanUseCase: ListFindingsByScanUseCase,
    private readonly cancelScanUseCase: CancelScanUseCase,
  ) {}

  @Post()
  async create(@CurrentOrg() orgId: string, @Body() dto: CreateScanRequestDto) {
    try {
      return await this.createScanUseCase.execute({ orgId, ...dto });
    } catch (error) {
      if (error instanceof RepoNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get()
  async list(@CurrentOrg() orgId: string, @Query() query: ListScansQueryDto) {
    const { page, pageSize, repoId } = query;
    return this.listScansByRepoUseCase.execute(orgId, repoId, { page, pageSize });
  }

  @Get(':id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getScanUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof ScanNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get(':id/summary')
  async getSummary(@CurrentOrg() orgId: string, @Param('id') id: string): Promise<ReportSummary> {
    try {
      return await this.getScanSummaryUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof ScanNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get(':id/findings')
  async getFindings(@CurrentOrg() orgId: string, @Param('id') id: string) {
    return this.listFindingsByScanUseCase.execute(orgId, id);
  }

  @Post(':id/cancel')
  async cancel(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.cancelScanUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof ScanNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
