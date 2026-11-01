import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AuthCredentialsDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class AuthUserDto {
  id!: string;
  email!: string;
}

export class AuthSessionResponseDto {
  token!: string;
  expiresAt!: string;
  user!: AuthUserDto;
}
