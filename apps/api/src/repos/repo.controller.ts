import { Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Repo } from '@cqp/core';
import type { PaginatedResult } from '@cqp/core';
import {
  CreateRepoUseCase,
  GetRepoUseCase,
  ListReposUseCase,
  RepoNotFoundError,
  UpdateRepoAccessTokenUseCase,
} from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { PaginationQueryDto } from '../common/pagination-query.dto.js';
import { CreateRepoRequestDto } from './dto/create-repo.dto.js';
import { UpdateRepoAccessTokenRequestDto } from './dto/update-repo-access-token.dto.js';

/** Ciphertext, but there's no reason to ever put it on the wire (docs/adr/0047) — every repo response strips it. */
function toRepoResponse(repo: Repo): Omit<Repo, 'encryptedAccessToken'> {
  const response = { ...repo };
  delete response.encryptedAccessToken;
  return response;
}

@ApiBearerAuth()
@ApiTags('repos')
@Controller('repos')
export class RepoController {
  constructor(
    private readonly createRepoUseCase: CreateRepoUseCase,
    private readonly getRepoUseCase: GetRepoUseCase,
    private readonly listReposUseCase: ListReposUseCase,
    private readonly updateRepoAccessTokenUseCase: UpdateRepoAccessTokenUseCase,
  ) {}

  @Post()
  async create(@CurrentOrg() orgId: string, @Body() dto: CreateRepoRequestDto) {
    const repo = await this.createRepoUseCase.execute({ orgId, ...dto });
    return toRepoResponse(repo);
  }

  @Get()
  async list(@CurrentOrg() orgId: string, @Query() pagination: PaginationQueryDto) {
    const page = await this.listReposUseCase.execute(orgId, pagination);
    return { ...page, data: page.data.map(toRepoResponse) } satisfies PaginatedResult<
      Omit<Repo, 'encryptedAccessToken'>
    >;
  }

  @Get(':id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      const repo = await this.getRepoUseCase.execute(orgId, id);
      return toRepoResponse(repo);
    } catch (error) {
      if (error instanceof RepoNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Put(':id/access-token')
  async updateAccessToken(
    @CurrentOrg() orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRepoAccessTokenRequestDto,
  ) {
    try {
      const repo = await this.updateRepoAccessTokenUseCase.execute(orgId, id, dto.accessToken);
      return toRepoResponse(repo);
    } catch (error) {
      if (error instanceof RepoNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
