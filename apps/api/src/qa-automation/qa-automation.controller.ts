import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import {
  GetQaAutomationRunUseCase,
  GetQaAutomationScheduleUseCase,
  ListQaAutomationRunsUseCase,
  QaAutomationRunNotFoundError,
  UpdateQaAutomationScheduleUseCase,
} from '@cqp/application';
import {
  enqueueManualQaAutomationRun,
  removeQaAutomationSchedule,
  upsertQaAutomationSchedule,
  type QaAutomationJobData,
} from '@cqp/queue';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { QA_AUTOMATION_QUEUE } from '../tokens.js';
import { UpdateQaAutomationScheduleRequestDto } from './dto/update-qa-automation-schedule.dto.js';
import { ListQaAutomationRunsQueryDto } from './dto/list-qa-automation-runs-query.dto.js';

@ApiBearerAuth()
@ApiTags('qa-automation')
@Controller('qa-automation')
export class QaAutomationController {
  constructor(
    private readonly getScheduleUseCase: GetQaAutomationScheduleUseCase,
    private readonly updateScheduleUseCase: UpdateQaAutomationScheduleUseCase,
    private readonly listRunsUseCase: ListQaAutomationRunsUseCase,
    private readonly getRunUseCase: GetQaAutomationRunUseCase,
    @Inject(QA_AUTOMATION_QUEUE) private readonly queue: Queue<QaAutomationJobData>,
  ) {}

  @Get('schedule')
  async getSchedule(@CurrentOrg() orgId: string) {
    return this.getScheduleUseCase.execute(orgId);
  }

  @Put('schedule')
  async updateSchedule(
    @CurrentOrg() orgId: string,
    @Body() dto: UpdateQaAutomationScheduleRequestDto,
  ) {
    const schedule = await this.updateScheduleUseCase.execute(orgId, dto);
    if (schedule.enabled) {
      await upsertQaAutomationSchedule(this.queue, orgId, schedule.intervalHours);
    } else {
      await removeQaAutomationSchedule(this.queue, orgId);
    }
    return schedule;
  }

  @Post('runs')
  async triggerRun(@CurrentOrg() orgId: string) {
    await enqueueManualQaAutomationRun(this.queue, orgId);
    return { status: 'queued' as const };
  }

  @Get('runs')
  async listRuns(@CurrentOrg() orgId: string, @Query() query: ListQaAutomationRunsQueryDto) {
    const { page, pageSize } = query;
    return this.listRunsUseCase.execute(orgId, { page, pageSize });
  }

  @Get('runs/:id')
  async getRun(@CurrentOrg() orgId: string, @Param('id') id: string) {
    try {
      return await this.getRunUseCase.execute(orgId, id);
    } catch (error) {
      if (error instanceof QaAutomationRunNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
