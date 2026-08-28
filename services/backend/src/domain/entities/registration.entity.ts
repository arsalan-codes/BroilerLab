import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * Registration — a manual bird-entry log (tag + initial weight + Shamsi datetime)
 * recorded by an operator at the farm. Distinct from auto-derived visits.
 * Used by the v-dev live panel.
 */
@Entity('registrations')
@Index('ix_reg_cycle', ['cycle_id', 'registered_at'])
export class Registration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'uuid' })
  cycle_id: string;

  @Column({ type: 'text' })
  bird_id: string;

  @Column({ type: 'double precision' })
  initial_weight_g: number;

  @Column({ type: 'text', nullable: true })
  shamsi_date: string | null;

  @Column({ type: 'text', nullable: true })
  sensor_id: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  registered_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
