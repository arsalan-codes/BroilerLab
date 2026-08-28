import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Visit } from '../../domain/entities/visit.entity';
import { TelemetryRaw } from '../../domain/entities/telemetry.entity';

interface OpenVisit {
  bird_id: string;
  sensor_id: string | null;
  rssi: number | null;
  init_w: number | null;
  start: Date;
  age_day: number | null;
  temp_c: number | null;
  humidity: number | null;
  ema_w: number | null;
}

/**
 * Stateful per-cycle processor. Tracks open visits by bird_id and derives
 * Visit rows from raw telemetry, mirroring the original Python processor.py.
 * In the new architecture this runs inside the MQTT ingestion worker (BullMQ)
 * and is kept pure/testable (no I/O).
 */
@Injectable()
export class VisitProcessor {
  constructor(
    @InjectRepository(Visit) private visits: Repository<Visit>,
    @InjectRepository(TelemetryRaw) private telemetry: Repository<TelemetryRaw>,
  ) {}

  private open = new Map<string, OpenVisit>(); // keyed by `${ownerId}:${cycleId}:${birdId}`

  private key(ownerId: string, cycleId: string, birdId: string) {
    return `${ownerId}:${cycleId}:${birdId}`;
  }

  /** Feed one raw event; returns a Visit if one was closed, else null. */
  ingest(
    ownerId: string,
    cycleId: string,
    ev: {
      bird_id?: string | null;
      sensor_id?: string | null;
      age_day?: number | null;
      raw_weight_g?: number | null;
      weight_g?: number | null;
      feed_delta_g?: number | null;
      temp_c?: number | null;
      humidity?: number | null;
      rssi?: number | null;
      is_visit_start?: boolean;
      is_visit_end?: boolean;
      ts: Date;
    },
  ): Visit | null {
    const birdId = ev.bird_id?.trim() || null;
    if (!birdId) return null; // no RFID -> co-feed / missed read, no visit

    const k = this.key(ownerId, cycleId, birdId);
    const weight = ev.weight_g ?? ev.raw_weight_g ?? null;
    const ctx = this.open.get(k);

    // Visit START
    if (ev.is_visit_start || (!ctx && weight != null)) {
      this.open.set(k, {
        bird_id: birdId,
        sensor_id: ev.sensor_id ?? null,
        rssi: ev.rssi ?? null,
        init_w: weight,
        start: ev.ts,
        age_day: ev.age_day ?? null,
        temp_c: ev.temp_c ?? null,
        humidity: ev.humidity ?? null,
        ema_w: weight,
      });
      // also persist the open visit immediately (the app shows live registrations)
      return null;
    }

    // Visit END
    if (ev.is_visit_end || ctx) {
      const open = ctx || this.open.get(k);
      if (open) {
        const feedIntake = ev.feed_delta_g ?? null;
        const v = this.visits.create({
          owner_id: ownerId,
          cycle_id: cycleId,
          bird_id: birdId,
          visit_start: open.start,
          visit_end: ev.ts,
          age_day: open.age_day ?? ev.age_day ?? null,
          initial_weight_g: open.init_w,
          final_weight_g: weight,
          feed_intake_g: feedIntake,
          sensor_id: open.sensor_id,
          rssi: ev.rssi ?? open.rssi,
          read_ok: true,
          co_feed: false,
          temp_c: ev.temp_c ?? open.temp_c,
          humidity: ev.humidity ?? open.humidity,
        });
        this.open.delete(k);
        return v;
      }
    }
    return null;
  }

  async flushVisits(visits: Visit[]): Promise<void> {
    if (visits.length) await this.visits.save(visits);
  }
}
