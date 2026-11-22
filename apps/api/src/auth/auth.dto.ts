import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password: string;
}

export class CurrentPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  currentPassword: string;
}

export class ChangePasswordDto extends CurrentPasswordDto {
  /** Minimum length comes from PASSWORD_MIN_LENGTH. */
  @IsString()
  @MaxLength(256)
  newPassword: string;
}

export class AccessTokenDto {
  accessToken: string;
}

/** Where the browser goes to link the Google account. */
export class GoogleUrlDto {
  url: string;
}

/** The admin's Conta vinculada Google; `email` is for display only. */
export class LinkedGoogleAccountDto {
  email: string;
  linkedAt: Date;
}
