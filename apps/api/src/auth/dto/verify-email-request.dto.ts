import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VerifyEmailRequestDto {
  @ApiProperty({ description: 'The raw token from the emailed verification link' })
  @IsString()
  @MinLength(1)
  token!: string;
}
