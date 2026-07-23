import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

/** Domain restriction (curatal.com) is a business rule, checked in LoginWithEmailUseCase — see docs/adr/0022, not here. */
export class LoginRequestDto {
  @ApiProperty({ description: 'A @curatal.com email address' })
  @IsEmail()
  email!: string;
}
