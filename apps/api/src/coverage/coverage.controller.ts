import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BaseRefNotFoundError,
  CancelCoverageRunUseCase,
  CoverageRunNotFoundError,
  CreateCoverageRunUseCase,
  GetCoverageRunUseCase,
  ListCoverageFileResultsByRunUseCase,
  ListCoverageRunsByRepoUseCase,
  RepoNotFoundError,
} from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { CreateCoverageRunRequestDto } from './dto/create-coverage-run.dto.js';
import { ListCoverageRunsQueryDto } from './dto/list-coverage-runs-query.dto.js';

/** Mirrors UnitTestController's shape (docs/adr/0021, 0023, 0024) — same lifecycle, see docs/adr/0025 for what's new: zero-LLM, no /generated-files equivalent since nothing is generated. */
@ApiBearerAuth()
@ApiTags('coverage-runs')
@Controller('coverage-runs')
export class CoverageController {
  constructor(
    private readonly createCoverageRunUseCase: CreateCoverageRunUseCase,
    private readonly getCoverageRunUseCase: GetCoverageRunUseCase,
    private readonly listCoverageRunsByRepoUseCase: ListCoverageRunsByRepoUseCase,
    private readonly listCoverageFileResultsByRunUseCase: ListCoverageFileResultsByRunUseCase,
    private readonly cancelCoverageRunUseCase: CancelCoverageRunUseCase,
  ) {}

  @Post()
  async create(@CurrentOrg() orgId: string, @Body() dto: CreateCoverageRunRequestDto) {
    try {
      return await this.createCoverageRunUseCase.execute({
        orgId,
        repoId: dto.repoId,
        ...(dto.baseRef !== undefined ? { baseRef: dto.baseRef } : {}),
      });
    } catch (error) {
      if (error instanceof RepoNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof BaseRefNotFoundError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  async list(@CurrentOrg() orgId: string, @Query() query: ListCoverageRunsQueryDto) {
    const { page, pageSize, repoId } = query;
    return this.listCoverageRunsByRepoUseCase.execute(orgId, repoId, { page, pageSize });
  }

  @Get(':id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getCoverageRunUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof CoverageRunNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get(':id/results')
  async getResults(@Param('id') id: string) {
    return this.listCoverageFileResultsByRunUseCase.execute(id);
  }

  @Post(':id/cancel')
  async cancel(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.cancelCoverageRunUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof CoverageRunNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
