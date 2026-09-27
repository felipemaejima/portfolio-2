import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  currentPassword: string;

  /** Minimum length comes from PASSWORD_MIN_LENGTH. */
  @IsString()
  @MaxLength(256)
  newPassword: string;
}

export class AccessTokenDto {
  accessToken: string;
}
