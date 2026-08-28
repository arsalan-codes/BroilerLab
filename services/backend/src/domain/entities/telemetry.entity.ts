import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * TelemetryRaw — raw device event row (matches the 12-col schema).
 * Stored in a TimescaleDB hypertable in prod (plain table in dev).
 * `uid` is the idempotency key from the device (UNIQUE at DB level).
 */
@Entity('telemetry_raw')
@Index('ix_telemetry_cycle', ['cycle_id', 'ts'])
@Index('ix_telemetry_bird', ['cycle_id', 'bird_id', 'ts'])
export class TelemetryRaw {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  device_id: string;

  @Column({ type: 'uuid' })
  cycle_id: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  uid: string;

  @Column({ type: 'timestamptz' })
  ts: Date;

  @Column({ type: 'varchar', length: 32, nullable: true })
  flock_id: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  bird_id: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  sensor_id: string | null;

  @Column({ type: 'int', nullable: true })
  age_day: number | null;

  @Column({ type: 'double precision', nullable: true })
  raw_weight_g: number | null;

  @Column({ type: 'double precision', nullable: true })
  weight_g: number | null;

  @Column({ type: 'double precision', nullable: true })
  feed_bin_kg: number | null;

  @Column({ type: 'double precision', nullable: true })
  feed_delta_g: number | null;

  @Column({ type: 'double precision', nullable: true })
  temp_c: number | null;

  @Column({ type: 'double precision', nullable: true })
  humidity: number | null;

  @Column({ type: 'double precision', nullable: true })
  rssi: number | null;

  @Column({ type: 'boolean', default: false })
  is_visit_start: boolean;

  @Column({ type: 'boolean', default: false })
  is_visit_end: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
