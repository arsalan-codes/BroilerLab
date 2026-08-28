import { mulberry32, randNorm, clamp } from './rng';

// LC1: raw = W + N(0, 4^2); EMA alpha=0.5 -> weight_g
// LC2: direct feed-bin mass model (25kg, refill at 3kg)
// RFID: 99.6% read OK, 0.4% miss; RSSI ~ clamp(N(-65, 5^2))

export function lc1Raw(trueWeight: number, rng: () => number): number {
  return trueWeight + randNorm(rng, 0, 4);
}

export function ema(prev: number, raw: number, alpha = 0.5): number {
  return alpha * raw + (1 - alpha) * prev;
}

export const BIN_CAPACITY_KG = 25;
export const BIN_REFILL_KG = 3;

export class FeedBin {
  kg: number;
  constructor(initial = BIN_CAPACITY_KG) {
    this.kg = initial;
  }
  consume(deltaG: number): { refilled: boolean } {
    this.kg -= deltaG / 1000;
    let refilled = false;
    if (this.kg <= BIN_REFILL_KG) {
      this.kg = BIN_CAPACITY_KG;
      refilled = true;
    }
    return { refilled };
  }
}

export function rfidRead(rng: () => number): { ok: boolean; rssi: number } {
  const ok = rng() > 0.004; // 0.4% miss
  const rssi = Math.round(clamp(randNorm(rng, -65, 5), -90, -40));
  return { ok, rssi };
}
