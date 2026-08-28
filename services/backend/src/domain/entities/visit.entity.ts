import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * Visit — one feeding-station visit by a bird (RFID entry + intake).
 * Derived from telemetry_raw by the ingestion processor.
 */
@Entity('visits')
@Index('ix_visits_cycle', ['cycle_id', 'visit_start'])
@Index('ix_visits_bird', ['cycle_id', 'bird_id'])
export class Visit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  cycle_id: string;

  @Column({ type: 'varchar', length: 32 })
  bird_id: string;

  @Column({ type: 'timestamptz' })
  visit_start: Date;

  @Column({ type: 'timestamptz', nullable: true })
  visit_end: Date | null;

  @Column({ type: 'int', nullable: true })
  age_day: number | null;

  @Column({ type: 'double precision', nullable: true })
  initial_weight_g: number | null;

  @Column({ type: 'double precision', nullable: true })
  final_weight_g: number | null;

  @Column({ type: 'double precision', nullable: true })
  feed_intake_g: number | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  sensor_id: string | null;

  @Column({ type: 'double precision', nullable: true })
  rssi: number | null;

  @Column({ type: 'boolean', default: true })
  read_ok: boolean;

  @Column({ type: 'boolean', default: false })
  co_feed: boolean;

  @Column({ type: 'double precision', nullable: true })
  temp_c: number | null;

  @Column({ type: 'double precision', nullable: true })
  humidity: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
