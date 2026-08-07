import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordRequestDto {
  @ApiProperty({ description: 'A @curatal.com email address' })
  @IsEmail()
  email!: string;
}
