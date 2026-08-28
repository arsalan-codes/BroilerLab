import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Device event payload — mirrors the 12-col firmware schema + idempotency uid. */
export class IngestEventDto {
  @IsString()
  uid: string; // idempotency key (device-generated)

  @IsDateString()
  ts: string;

  @IsOptional()
  @IsString()
  flock_id?: string;

  @IsOptional()
  @IsString()
  bird_id?: string;

  @IsOptional()
  @IsString()
  sensor_id?: string;

  @IsOptional()
  @IsInt()
  age_day?: number;

  @IsOptional()
  @IsNumber()
  raw_weight_g?: number;

  @IsOptional()
  @IsNumber()
  weight_g?: number;

  @IsOptional()
  @IsNumber()
  feed_bin_kg?: number;

  @IsOptional()
  @IsNumber()
  feed_delta_g?: number;

  @IsOptional()
  @IsNumber()
  temp_c?: number;

  @IsOptional()
  @IsNumber()
  humidity?: number;

  @IsOptional()
  @IsNumber()
  rssi?: number;

  @IsOptional()
  @IsBoolean()
  is_visit_start?: boolean;

  @IsOptional()
  @IsBoolean()
  is_visit_end?: boolean;
}

export class IngestBatchDto {
  @IsOptional()
  @IsString()
  cycle_id?: string;

  @IsString()
  device_id: string;

  @IsOptional()
  @IsString()
  flock_id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestEventDto)
  events: IngestEventDto[];
}
