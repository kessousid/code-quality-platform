import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** The real minimum-length check happens in ResetPasswordUseCase — see docs/adr/0041, not here. */
export class ResetPasswordRequestDto {
  @ApiProperty({ description: 'The raw token from the emailed reset link' })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}
