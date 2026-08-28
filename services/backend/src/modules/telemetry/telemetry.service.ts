import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelemetryRaw } from '../../domain/entities/telemetry.entity';
import { Cycle } from '../../domain/entities/cycle.entity';
import { Device } from '../../domain/entities/device.entity';
import { IngestBatchDto } from './dto/ingest.dto';
import { VisitProcessor } from './visit-processor';
import { ReqUser } from '../cycles/cycles.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DevicesService } from '../devices/devices.service';

@Injectable()
export class TelemetryService {
  constructor(
    @InjectRepository(TelemetryRaw) private telemetry: Repository<TelemetryRaw>,
    @InjectRepository(Cycle) private cycles: Repository<Cycle>,
    @InjectRepository(Device) private devices: Repository<Device>,
    private processor: VisitProcessor,
    private events: EventEmitter2,
    private devicesSvc: DevicesService,
  ) {}

  /** Ingest a batch of device events for a cycle. Idempotent via uid UNIQUE. */
  async ingestBatch(dto: IngestBatchDto, owner: ReqUser) {
    const cycle = await this.cycles.findOne({
      where: { id: dto.cycle_id, owner_id: owner.id },
    });
    if (!cycle) throw new NotFoundException('cycle not found');

    // Resolve a device for this owner (default device per owner, or create one)
    const device = await this.devicesSvc.upsert(`owner-${owner.id}`, `Lab device (${owner.email})`, owner.id);

    const closed: any[] = [];
    for (const ev of dto.events) {
      // Idempotent insert: ON CONFLICT (uid) DO NOTHING
      await this.telemetry
        .createQueryBuilder()
        .insert()
        .into(TelemetryRaw)
        .values({
          owner_id: owner.id,
          device_id: device.id,
          cycle_id: dto.cycle_id!,
          uid: ev.uid,
          ts: new Date(ev.ts),
          flock_id: ev.flock_id ?? null,
          bird_id: ev.bird_id ?? null,
          sensor_id: ev.sensor_id ?? null,
          age_day: ev.age_day ?? null,
          raw_weight_g: ev.raw_weight_g ?? null,
          weight_g: ev.weight_g ?? null,
          feed_bin_kg: ev.feed_bin_kg ?? null,
          feed_delta_g: ev.feed_delta_g ?? null,
          temp_c: ev.temp_c ?? null,
          humidity: ev.humidity ?? null,
          rssi: ev.rssi ?? null,
          is_visit_start: !!ev.is_visit_start,
          is_visit_end: !!ev.is_visit_end,
        })
        .orIgnore()
        .execute();
      const visit = this.processor.ingest(owner.id, dto.cycle_id!, {
        ...ev,
        ts: new Date(ev.ts),
      });
      if (visit) closed.push(visit);
    }
    if (closed.length) await this.processor.flushVisits(closed);

    this.events.emit('telemetry:new', { cycleId: dto.cycle_id!, count: dto.events.length });
    return { stored: dto.events.length, visits: closed.length };
  }
}
