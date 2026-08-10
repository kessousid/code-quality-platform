import { ApiProperty } from '@nestjs/swagger';
import { IsString, ValidateIf } from 'class-validator';

export class UpdateRepoAccessTokenRequestDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The new personal access token, or null to clear a previously-set one.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  accessToken!: string | null;
}
