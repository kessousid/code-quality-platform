import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateRepoUseCase,
  GetRepoUseCase,
  ListReposUseCase,
  RepoNotFoundError,
} from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { PaginationQueryDto } from '../common/pagination-query.dto.js';
import { CreateRepoRequestDto } from './dto/create-repo.dto.js';

@ApiBearerAuth()
@ApiTags('repos')
@Controller('repos')
export class RepoController {
  constructor(
    private readonly createRepoUseCase: CreateRepoUseCase,
    private readonly getRepoUseCase: GetRepoUseCase,
    private readonly listReposUseCase: ListReposUseCase,
  ) {}

  @Post()
  async create(@CurrentOrg() orgId: string, @Body() dto: CreateRepoRequestDto) {
    return this.createRepoUseCase.execute({ orgId, ...dto });
  }

  @Get()
  async list(@CurrentOrg() orgId: string, @Query() pagination: PaginationQueryDto) {
    return this.listReposUseCase.execute(orgId, pagination);
  }

  @Get(':id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getRepoUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof RepoNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
