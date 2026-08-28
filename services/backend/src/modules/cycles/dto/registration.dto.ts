import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class CreateRegistrationDto {
  @IsString()
  bird_id: string;

  @IsNumber()
  initial_weight_g: number;

  @IsOptional()
  @IsString()
  shamsi_date?: string;

  @IsOptional()
  @IsString()
  sensor_id?: string;

  @IsOptional()
  @IsDateString()
  registered_at?: string;
}
