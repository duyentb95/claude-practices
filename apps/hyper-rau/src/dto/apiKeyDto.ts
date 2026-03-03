import { IsNotEmpty, IsString } from 'class-validator';

export class ApiKeyDto {
  @IsNotEmpty()
  @IsString()
  apiKey: string;

  @IsNotEmpty()
  @IsString()
  secretKey: string;

  @IsString()
  passPhrase?: string;

  @IsNotEmpty()
  @IsString()
  walletId?: string;
}
