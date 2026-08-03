import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** No intervalHours — the staging cron pattern is a fixed constant, not user-configurable (docs/adr/0036). */
export class UpdateQaAutomationStagingScheduleRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
