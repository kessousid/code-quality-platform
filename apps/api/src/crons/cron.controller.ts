import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CRON_DEFINITIONS, CRON_ENVIRONMENT_BASE_URLS } from '@cqp/core';

/** Static definitions (docs/adr/0033) — no DB, no use case needed. */
@ApiBearerAuth()
@ApiTags('crons')
@Controller('crons')
export class CronController {
  @Get()
  list() {
    return { crons: CRON_DEFINITIONS, environments: Object.keys(CRON_ENVIRONMENT_BASE_URLS) };
  }
}
