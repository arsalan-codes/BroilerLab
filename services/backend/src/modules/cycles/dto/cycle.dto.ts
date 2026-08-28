import { IsString, IsInt, IsOptional, IsIn, IsDateString, Min, Max, Length } from 'class-validator';

export class CreateCycleDto {
  @IsString()
  @Length(1, 32)
  cycle_code: string;

  @IsString()
  @Length(1, 120)
  label: string;

  @IsOptional()
  @IsString()
  @IsIn(['ross308', 'cobb500', 'aa+', 'hubbard'])
  strain?: 'ross308' | 'cobb500' | 'aa+' | 'hubbard';

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  bird_count?: number;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  pen_id?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class CycleStatsQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CursorPageQuery {
  @IsOptional()
  @IsString()
  cursor?: string; // base64 of last id+ts for keyset pagination

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
