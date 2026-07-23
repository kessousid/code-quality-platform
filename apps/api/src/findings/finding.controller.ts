import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FindingNotFoundError, GetFindingUseCase, ListFindingsUseCase } from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { ListFindingsQueryDto } from './dto/list-findings-query.dto.js';

@ApiBearerAuth()
@ApiTags('findings')
@Controller('findings')
export class FindingController {
  constructor(
    private readonly listFindingsUseCase: ListFindingsUseCase,
    private readonly getFindingUseCase: GetFindingUseCase,
  ) {}

  @Get()
  async list(@CurrentOrg() orgId: string, @Query() query: ListFindingsQueryDto) {
    const { page, pageSize, ...filter } = query;
    return this.listFindingsUseCase.execute(orgId, filter, { page, pageSize });
  }

  @Get(':id')
  async getById(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getFindingUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof FindingNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
