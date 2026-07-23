import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSessionRequestDto {
  @ApiProperty({ description: 'A previously issued API token' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
