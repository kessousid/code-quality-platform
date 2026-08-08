import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** No intervalHours — production runs on a fixed twice-daily cron, not user-configurable (docs/adr/0042). */
export class UpdateQaAutomationScheduleRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
