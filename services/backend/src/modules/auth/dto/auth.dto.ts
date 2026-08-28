import { IsEmail, IsString, MinLength, IsEnum } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  full_name?: string;

  @IsEnum(['admin', 'researcher', 'viewer'])
  role?: 'admin' | 'researcher' | 'viewer';
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class TokenPair {
  access_token: string;
  refresh_token: string;
}
