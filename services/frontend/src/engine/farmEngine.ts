import type { Bird, DeviceRecord, Experiment, Pen, Registration, SimEvent, StrainKey } from '../types';
import { mulberry32 } from './rng';
import { makeBird, GrowthEngine } from './growth';
import { intakeModel } from './meal';
import { lc1Raw, ema, FeedBin, rfidRead } from './sensor';
import { envAt } from './environment';
import { toShamsiString, gregorianNow } from '../i18n/shamsi';

export interface FarmSim {
  birds: Bird[];
  pens: Pen[];
  strain: StrainKey;
  bin: FeedBin;
  events: SimEvent[];
  records: DeviceRecord[];
  registrations: Registration[];
  emaWeight: Record<string, number>;
}

export function buildFarm(exp: Experiment, strain: StrainKey, seed: number): FarmSim {
  const birds: Bird[] = [];
  let idx = 0;
  for (const pen of exp.pens) {
    for (let i = 0; i < pen.birdCount; i++) {
      const sex: 'm' | 'f' = i % 2 === 0 ? 'm' : 'f';
      birds.push(makeBird(pen.id, idx++, seed, sex, pen.treatment));
    }
  }
  return {
    birds,
    pens: exp.pens,
    strain,
    bin: new FeedBin(),
    events: [],
    records: [],
    registrations: [],
    emaWeight: {},
  };
}

// Advance simulation by one day for all birds; generate device records (3 rows/meal).
export function simulateDay(farm: FarmSim, day: number, flockId = 'F01'): void {
  farm.events = [];
  for (const bird of farm.birds) {
    const ge = new GrowthEngine(bird);
    const age = day;
    const w = ge.weightAt(farm.strain, age);
    const prevEma = farm.emaWeight[bird.id] ?? w;
    const { meals, size, durationMin } = intakeModel(farm.strain, age, bird.baseSeed);
    // RFID + registration
    const rng = mulberry32(bird.baseSeed ^ (day * 2654435761));
    const { ok, rssi } = rfidRead(rng);
    if (ok) {
      const now = new Date();
      const reg: Registration = {
        id: `${bird.id}-${day}`,
        bird_id: bird.id,
        initial_weight_g: Math.round(prevEma),
        shamsi_date: toShamsiString(now),
        gregorian_date: now.toISOString().slice(0, 10),
        time: now.toTimeString().slice(0, 8),
        sensor_id: flockId,
        rssi,
      };
      farm.registrations.unshift(reg);
      // 3 rows per meal
      for (let m = 0; m < meals; m++) {
        const raw = lc1Raw(w, rng);
        const filtered = ema(prevEma, raw);
        farm.emaWeight[bird.id] = filtered;
        const delta = Math.round(size * (m + 1) / meals);
        const refill = farm.bin.consume(delta);
        const env = envAt(8 + (m % 12), age);
        for (let r = 0; r < 3; r++) {
          const rec: DeviceRecord = {
            timestamp: `${gregorianNow().slice(0, 10)} ${String(8 + (m % 12)).padStart(2, '0')}:${String(r * 10).padStart(2, '0')}:0${r}`,
            flock_id: flockId,
            bird_id: bird.id,
            sensor_id: flockId,
            age_day: age,
            raw_weight_g: Math.round(raw + (r - 1) * 1.5),
            weight_g: Math.round(filtered),
            feed_bin_kg: Math.round(farm.bin.kg * 100) / 100,
            feed_delta_g: r === 2 ? -delta : 0,
            temp_c: env.tempC,
            humidity: env.humidity,
            rssi,
          };
          farm.records.push(rec);
        }
        farm.events.push({ kind: 'meal_finished', ts: Date.now(), birdId: bird.id, penId: bird.penId, text: `Meal ${m + 1}/${meals} ${bird.id}`, tone: 'ok' });
        if (refill.refilled) farm.events.push({ kind: 'bin_refilled', ts: Date.now(), text: 'Bin refilled 25kg', tone: 'info' });
      }
    } else {
      farm.events.push({ kind: 'rfid_miss', ts: Date.now(), birdId: bird.id, text: `RFID miss ${bird.id}`, tone: 'warn' });
    }
  }
}
