import type { Bird, Pen, Sex, TreatmentType, StrainKey } from '../types';
import { mulberry32, randNorm } from './rng';
import { catalogBW } from './strains';

// Individual growth: W(t) = W_cat(t) * (1 + CV + eps_t) * m_pen * gamma(t)
// eps_t = 0.9*eps_{t-1} + N(0, 0.008^2)  (AR(1))
// m_pen ~ N(0, 0.012^2)

export function makeBird(
  penId: string,
  index: number,
  seed: number,
  sex: Sex,
  treatment: TreatmentType,
): Bird {
  // Common Random Numbers: bird block stream = seed*7919+13
  const block = mulberry32(seed * 7919 + 13 + index * 31);
  const cv = 1 + randNorm(block, 0, 0.05); // ~5% CV around 1.0
  const eps0 = randNorm(block, 0, 0.008);
  const mPen = 1 + randNorm(block, 0, 0.012);
  const sexBias = sex === 'm' ? 1.04 : 0.96;
  return {
    id: `${penId}-B${String(index + 1).padStart(3, '0')}`,
    penId,
    sex,
    treatment,
    cv: cv + (sexBias - 1),
    eps: eps0,
    mPen,
    baseSeed: seed * 7919 + 13 + index * 31,
  };
}

export function treatmentModifiers(t: TreatmentType): { fi: number; bw: number } {
  switch (t) {
    case 'probiotic':
      return { fi: 1.01, bw: 1.015 };
    case 'growth':
      return { fi: 1.02, bw: 1.025 };
    case 'vaccine':
      return { fi: 0.98, bw: 1.0 };
    case 'lowprotein':
      return { fi: 1.04, bw: 0.975 };
    case 'heat':
      return { fi: 0.97, bw: 0.99 };
    default:
      return { fi: 1.0, bw: 1.0 };
  }
}

export function gamma(treatment: TreatmentType, age: number): number {
  if (treatment === 'vaccine') {
    if (age >= 19 && age <= 22) return 0.9; // ~10% temporary drop
    return 1.0;
  }
  if (treatment === 'heat') {
    if (age >= 32 && age <= 38) return 0.93; // ~1.2%/°C * 5°C
    if (age > 38 && age <= 44) return 0.98; // partial recovery
    return 1.0;
  }
  return 1.0;
}

export class GrowthEngine {
  private eps: number;
  private rng: () => number;
  constructor(private bird: Bird) {
    this.eps = bird.eps;
    this.rng = mulberry32(bird.baseSeed ^ 0x9e3779b9);
  }
  weightAt(strain: StrainKey, age: number): number {
    const wCat = catalogBW(strain, age);
    this.eps = 0.9 * this.eps + randNorm(this.rng, 0, 0.008);
    const g = gamma(this.bird.treatment, age);
    const mod = treatmentModifiers(this.bird.treatment);
    const w = wCat * this.bird.cv * this.bird.mPen * g * mod.bw;
    return Math.max(20, w);
  }
}
