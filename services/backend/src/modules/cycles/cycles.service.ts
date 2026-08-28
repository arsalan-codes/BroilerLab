import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Cycle } from '../../domain/entities/cycle.entity';
import { Visit } from '../../domain/entities/visit.entity';
import { TelemetryRaw } from '../../domain/entities/telemetry.entity';
import { Registration } from '../../domain/entities/registration.entity';
import { CreateCycleDto } from './dto/cycle.dto';
import { CreateRegistrationDto } from './dto/registration.dto';
import { IngestBatchDto } from '../telemetry/dto/ingest.dto';
import { TelemetryService } from '../telemetry/telemetry.service';
import { User } from '../../domain/entities/user.entity';

export interface ReqUser {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class CyclesService {
  constructor(
    @InjectRepository(Cycle) private cycles: Repository<Cycle>,
    @InjectRepository(Visit) private visitsRepo: Repository<Visit>,
    @InjectRepository(Registration) private registrations: Repository<Registration>,
    @InjectRepository(TelemetryRaw) private telemetry: Repository<TelemetryRaw>,
    private telemetrySvc: TelemetryService,
  ) {}

  /** Anti-IDOR: ownerId ALWAYS comes from the authenticated token. */
  async create(dto: CreateCycleDto, owner: ReqUser): Promise<Cycle> {
    const existing = await this.cycles.findOne({
      where: { owner_id: owner.id, cycle_code: dto.cycle_code },
    });
    if (existing) throw new ConflictException('cycle_code already used for this owner');
    const c = this.cycles.create({
      owner_id: owner.id,
      cycle_code: dto.cycle_code,
      label: dto.label,
      strain: dto.strain ?? 'ross308',
      start_date: dto.start_date ? new Date(dto.start_date) : new Date(),
      bird_count: dto.bird_count ?? 0,
      pen_id: dto.pen_id ?? null,
      notes: dto.notes ?? null,
    });
    return this.cycles.save(c);
  }

  async list(owner: ReqUser): Promise<Cycle[]> {
    return this.cycles.find({ where: { owner_id: owner.id }, order: { created_at: 'DESC' } });
  }

  async getById(id: string, owner: ReqUser): Promise<Cycle> {
    const c = await this.cycles.findOne({ where: { id, owner_id: owner.id } });
    if (!c) throw new NotFoundException('cycle not found');
    return c;
  }

  async remove(id: string, owner: ReqUser): Promise<void> {
    const c = await this.getById(id, owner); // enforces ownership
    await this.cycles.remove(c);
  }

  async stats(id: string, owner: ReqUser): Promise<Record<string, any>> {
    await this.getById(id, owner); // Anti-IDOR check
    const rows = await this.telemetry
      .createQueryBuilder('t')
      .select('COUNT(*)', 'device_rows')
      .addSelect('COUNT(DISTINCT t.bird_id)', 'unique_birds')
      .addSelect('AVG(t.feed_delta_g)', 'total_intake_g')
      .addSelect('AVG(t.weight_g) FILTER (WHERE t.bird_id IS NOT NULL)', 'avg_initial_weight_g')
      .addSelect('COUNT(*) FILTER (WHERE t.bird_id IS NULL)', 'missed_rfid')
      .where('t.cycle_id = :id', { id })
      .andWhere('t.owner_id = :owner', { owner: owner.id })
      .getRawOne();
    const visitCount = await this.visitsRepo
      .createQueryBuilder('v')
      .where('v.cycle_id = :id', { id })
      .andWhere('v.owner_id = :owner', { owner: owner.id })
      .getCount();
    return {
      device_rows: Number(rows.device_rows) || 0,
      unique_birds: Number(rows.unique_birds) || 0,
      visits: visitCount,
      total_intake_g: Number(rows.total_intake_g) || 0,
      avg_initial_weight_g: Number(rows.avg_initial_weight_g) || 0,
      missed_rfid: Number(rows.missed_rfid) || 0,
    };
  }

  async visits(
    id: string,
    owner: ReqUser,
    limit = 50,
  ): Promise<Record<string, any>[]> {
    await this.getById(id, owner);
    // Explicit aliases so getRawMany returns clean keys (bird_id, not v_bird_id).
    const qb = this.visitsRepo
      .createQueryBuilder('v')
      .select('v.id', 'id')
      .addSelect('v.bird_id', 'bird_id')
      .addSelect('v.visit_start', 'visit_start')
      .addSelect('v.visit_end', 'visit_end')
      .addSelect('v.age_day', 'age_day')
      .addSelect('v.initial_weight_g', 'initial_weight_g')
      .addSelect('v.final_weight_g', 'final_weight_g')
      .addSelect('v.feed_intake_g', 'feed_intake_g')
      .addSelect('v.sensor_id', 'sensor_id')
      .addSelect('v.rssi', 'rssi')
      .addSelect('v.read_ok', 'read_ok')
      .addSelect('v.co_feed', 'co_feed')
      .where('v.cycle_id = :id', { id })
      .andWhere('v.owner_id = :owner', { owner: owner.id })
      .orderBy('v.visit_start', 'DESC');
    if (limit > 0) qb.limit(limit);
    return qb.getRawMany();
  }

  async listRegistrations(
    id: string,
    owner: ReqUser,
    limit = 50,
  ): Promise<Record<string, any>[]> {
    await this.getById(id, owner);
    // Explicit aliases so getRawMany returns clean keys (bird_id, not r_bird_id).
    const qb = this.registrations
      .createQueryBuilder('r')
      .select('r.id', 'id')
      .addSelect('r.bird_id', 'bird_id')
      .addSelect('r.initial_weight_g', 'initial_weight_g')
      .addSelect('r.shamsi_date', 'shamsi_date')
      .addSelect('r.sensor_id', 'sensor_id')
      .addSelect('r.registered_at', 'registered_at')
      .where('r.cycle_id = :id', { id })
      .andWhere('r.owner_id = :owner', { owner: owner.id })
      .orderBy('r.registered_at', 'DESC');
    if (limit > 0) qb.limit(limit);
    return qb.getRawMany();
  }

  async createRegistration(
    id: string,
    dto: CreateRegistrationDto,
    owner: ReqUser,
  ): Promise<Registration> {
    const cycle = await this.getById(id, owner);
    const r = this.registrations.create({
      owner_id: owner.id,
      cycle_id: cycle.id,
      bird_id: dto.bird_id,
      initial_weight_g: dto.initial_weight_g,
      shamsi_date: dto.shamsi_date ?? null,
      sensor_id: dto.sensor_id ?? null,
      registered_at: dto.registered_at ? new Date(dto.registered_at) : new Date(),
    });
    return this.registrations.save(r);
  }

  /** Ingest a batch of device events for a specific cycle (Anti-IDOR: URL id wins). */
  async ingestForCycle(id: string, dto: IngestBatchDto, owner: ReqUser) {
    await this.getById(id, owner); // ownership check
    // Force cycle_id from the URL param so a caller cannot write to another cycle.
    const safeDto: IngestBatchDto = { ...dto, cycle_id: id };
    return this.telemetrySvc.ingestBatch(safeDto, owner);
  }

  /**
   * CSV export (visits | registrations) for a cycle.
   * Anti-IDOR enforced via getById; cells are guarded against CSV/formula
   * injection (leading =, +, -, @ get a leading apostrophe) and proper quoting.
   */
  async exportCsv(id: string, owner: ReqUser, kind: 'visits' | 'registrations'): Promise<string> {
    await this.getById(id, owner); // Anti-IDOR check

    let header: string[];
    let rows: Record<string, any>[];

    if (kind === 'registrations') {
      header = ['id', 'bird_id', 'initial_weight_g', 'shamsi_date', 'sensor_id', 'registered_at'];
      rows = await this.listRegistrations(id, owner, 0); // 0 = no limit (full export)
    } else {
      header = [
        'id', 'bird_id', 'visit_start', 'visit_end', 'age_day',
        'initial_weight_g', 'final_weight_g', 'feed_intake_g',
        'sensor_id', 'rssi', 'read_ok', 'co_feed',
      ];
      rows = await this.visits(id, owner, 0); // 0 = no limit (full export)
    }

    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(header.map((h) => this.csvCell(r[h])).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }

  /** CSV-injection-safe cell encoding (OWASP CSV Injection guidance). */
  private csvCell(v: any): string {
    let s = v === null || v === undefined ? '' : String(v);
    if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  }
}
