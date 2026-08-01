import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateQaAutomationScheduleRequestDto {
  @ApiPropertyOptional({ minimum: 1, description: 'How often the suite runs, in hours.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
