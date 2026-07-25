import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CronNotFoundError, ListCronRunsUseCase, TriggerCronRunUseCase } from '@cqp/application';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { TriggerCronRunRequestDto } from './dto/trigger-cron-run.dto.js';
import { ListCronRunsQueryDto } from './dto/list-cron-runs-query.dto.js';

@ApiBearerAuth()
@ApiTags('cron-runs')
@Controller('cron-runs')
export class CronRunController {
  constructor(
    private readonly triggerCronRunUseCase: TriggerCronRunUseCase,
    private readonly listCronRunsUseCase: ListCronRunsUseCase,
  ) {}

  @Post()
  async trigger(@CurrentOrg() orgId: string, @Body() dto: TriggerCronRunRequestDto) {
    try {
      return await this.triggerCronRunUseCase.execute({ orgId, ...dto });
    } catch (error) {
      if (error instanceof CronNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Get()
  async list(@CurrentOrg() orgId: string, @Query() query: ListCronRunsQueryDto) {
    const { page, pageSize } = query;
    return this.listCronRunsUseCase.execute(orgId, { page, pageSize });
  }
}
