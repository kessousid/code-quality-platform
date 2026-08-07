import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/** Domain restriction (curatal.com) and the real minimum-length check both happen in SignupUseCase — see docs/adr/0041, not here (this is just "well-formed", not "acceptable"). */
export class SignupRequestDto {
  @ApiProperty({ description: 'A @curatal.com email address' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}
