import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

/**
 * Cycle — a rearing (pulturash) period. Each cycle owns its own isolated dataset.
 * owner_id enforces Anti-IDOR: every query must filter by the authenticated owner.
 */
@Entity('cycles')
export class Cycle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({ type: 'varchar', length: 32 })
  @Index()
  cycle_code: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 40, default: 'ross308' })
  strain: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  start_date: Date;

  @Column({ type: 'timestamptz', nullable: true })
  end_date: Date | null;

  @Column({ type: 'int', default: 0 })
  bird_count: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  pen_id: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Unique per owner (no two cycles with same code for same owner)
  // Enforced at DB level via migration UNIQUE (owner_id, cycle_code)
}
