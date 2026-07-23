import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CancelUnitTestRunUseCase,
  CreateUnitTestRunUseCase,
  GetUnitTestRunUseCase,
  ListGeneratedTestFilesByRunUseCase,
  ListTestCaseResultsByRunUseCase,
  ListUnitTestRunsByRepoUseCase,
  RepoNotFoundError,
  UnitTestRunNotFoundError,
} from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { CreateUnitTestRunRequestDto } from './dto/create-unit-test-run.dto.js';
import { ListUnitTestRunsQueryDto } from './dto/list-unit-test-runs-query.dto.js';

/** Mirrors ScanController's shape (docs/adr/0021, 0023) — same lifecycle, same reasoning, see docs/adr/0024 for what's actually new. */
@ApiBearerAuth()
@ApiTags('unit-tests')
@Controller('unit-tests')
export class UnitTestController {
  constructor(
    private readonly createUnitTestRunUseCase: CreateUnitTestRunUseCase,
    private readonly getUnitTestRunUseCase: GetUnitTestRunUseCase,
    private readonly listUnitTestRunsByRepoUseCase: ListUnitTestRunsByRepoUseCase,
    private readonly listTestCaseResultsByRunUseCase: ListTestCaseResultsByRunUseCase,
    private readonly listGeneratedTestFilesByRunUseCase: ListGeneratedTestFilesByRunUseCase,
    private readonly cancelUnitTestRunUseCase: CancelUnitTestRunUseCase,
  ) {}

  @Post()
  async create(@CurrentOrg() orgId: string, @Body() dto: CreateUnitTestRunRequestDto) {
    try {
      return await this.createUnitTestRunUseCase.execute({
        orgId,
        repoId: dto.repoId,
        target: dto.target,
        ...(dto.generator !== undefined ? { generator: dto.generator } : {}),
      });
    } catch (error) {
      if (error instanceof RepoNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get()
  async list(@CurrentOrg() orgId: string, @Query() query: ListUnitTestRunsQueryDto) {
    const { page, pageSize, repoId } = query;
    return this.listUnitTestRunsByRepoUseCase.execute(orgId, repoId, { page, pageSize });
  }

  @Get(':id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getUnitTestRunUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof UnitTestRunNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get(':id/results')
  async getResults(@Param('id') id: string) {
    return this.listTestCaseResultsByRunUseCase.execute(id);
  }

  @Get(':id/generated-files')
  async getGeneratedFiles(@Param('id') id: string) {
    return this.listGeneratedTestFilesByRunUseCase.execute(id);
  }

  @Post(':id/cancel')
  async cancel(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.cancelUnitTestRunUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof UnitTestRunNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
