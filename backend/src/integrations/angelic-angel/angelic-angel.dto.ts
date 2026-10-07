import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const cookieValuePattern = /^[A-Za-z0-9._~%+\-=/]+$/;

export class ProvisionXSessionDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  @Matches(cookieValuePattern)
  authToken!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  @Matches(cookieValuePattern)
  ct0!: string;
}

export class ProvisionXSessionResponseDto {
  status!: 'registered';
}
