import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { CronEnvironment } from '@cqp/core';

/** Prod deliberately excluded for now — see docs/adr/0033. */
const CRON_ENVIRONMENTS: CronEnvironment[] = ['dev', 'staging'];

export class TriggerCronRunRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cronId!: string;

  @ApiProperty({ enum: CRON_ENVIRONMENTS })
  @IsIn(CRON_ENVIRONMENTS)
  environment!: CronEnvironment;
}
