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
  GetQaAutomationStagingScheduleUseCase,
  ListQaAutomationRunsUseCase,
  QaAutomationRunNotFoundError,
  UpdateQaAutomationScheduleUseCase,
  UpdateQaAutomationStagingScheduleUseCase,
} from '@cqp/application';
import {
  enqueueManualQaAutomationRun,
  enqueueManualQaAutomationStagingRun,
  removeQaAutomationSchedule,
  removeQaAutomationStagingSchedule,
  upsertQaAutomationSchedule,
  upsertQaAutomationStagingSchedule,
  type QaAutomationJobData,
  type QaAutomationStagingJobData,
} from '@cqp/queue';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import { QA_AUTOMATION_QUEUE, QA_AUTOMATION_STAGING_QUEUE } from '../tokens.js';
import { UpdateQaAutomationScheduleRequestDto } from './dto/update-qa-automation-schedule.dto.js';
import { UpdateQaAutomationStagingScheduleRequestDto } from './dto/update-qa-automation-staging-schedule.dto.js';
import { ListQaAutomationRunsQueryDto } from './dto/list-qa-automation-runs-query.dto.js';

@ApiBearerAuth()
@ApiTags('qa-automation')
@Controller('qa-automation')
export class QaAutomationController {
  constructor(
    private readonly getScheduleUseCase: GetQaAutomationScheduleUseCase,
    private readonly updateScheduleUseCase: UpdateQaAutomationScheduleUseCase,
    private readonly getStagingScheduleUseCase: GetQaAutomationStagingScheduleUseCase,
    private readonly updateStagingScheduleUseCase: UpdateQaAutomationStagingScheduleUseCase,
    private readonly listRunsUseCase: ListQaAutomationRunsUseCase,
    private readonly getRunUseCase: GetQaAutomationRunUseCase,
    @Inject(QA_AUTOMATION_QUEUE) private readonly queue: Queue<QaAutomationJobData>,
    @Inject(QA_AUTOMATION_STAGING_QUEUE)
    private readonly stagingQueue: Queue<QaAutomationStagingJobData>,
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
      await upsertQaAutomationSchedule(this.queue, orgId);
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

  @Get('staging/schedule')
  async getStagingSchedule(@CurrentOrg() orgId: string) {
    return this.getStagingScheduleUseCase.execute(orgId);
  }

  @Put('staging/schedule')
  async updateStagingSchedule(
    @CurrentOrg() orgId: string,
    @Body() dto: UpdateQaAutomationStagingScheduleRequestDto,
  ) {
    const schedule = await this.updateStagingScheduleUseCase.execute(orgId, dto);
    if (schedule.enabled) {
      await upsertQaAutomationStagingSchedule(this.stagingQueue, orgId);
    } else {
      await removeQaAutomationStagingSchedule(this.stagingQueue, orgId);
    }
    return schedule;
  }

  @Post('staging/runs')
  async triggerStagingRun(@CurrentOrg() orgId: string) {
    await enqueueManualQaAutomationStagingRun(this.stagingQueue, orgId);
    return { status: 'queued' as const };
  }

  @Get('runs')
  async listRuns(@CurrentOrg() orgId: string, @Query() query: ListQaAutomationRunsQueryDto) {
    const { page, pageSize, environment } = query;
    return this.listRunsUseCase.execute(orgId, { page, pageSize }, environment ?? 'production');
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
