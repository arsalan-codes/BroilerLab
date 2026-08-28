import type { StrainKey } from '../types';
import { catalogFI } from './strains';
import { mulberry32, randNorm } from './rng';

// Meal count: n = max(6, round(FI/rate * 60/D))
// D(a) = min(135, 45 + 2.192*(a-15))  (meal duration minutes)
// w ~ Weibull(beta=1.35)  (meal size shares)

export function mealCount(fiDay: number, age: number): number {
  const D = Math.min(135, 45 + 2.192 * (age - 15));
  const rate = 25; // g/min assumed intake rate
  return Math.max(6, Math.round((fiDay / rate) * (60 / D)));
}

export function mealDuration(age: number): number {
  return Math.min(135, 45 + 2.192 * (age - 15));
}

// Weibull sample with beta=1.35, scaled mean=1
export function weibullShare(rng: () => number): number {
  const beta = 1.35;
  const u = rng();
  const x = Math.pow(-Math.log(1 - u), 1 / beta);
  const mean = Math.pow(Math.PI, 1 / beta) / Math.sin(Math.PI / beta); // E[W]
  return x / mean;
}

export function intakeModel(strain: StrainKey, age: number, birdSeed: number): { meals: number; size: number; durationMin: number } {
  const fi = catalogFI(strain, age);
  const rng = mulberry32(birdSeed ^ 0x85ebca6b);
  const n = mealCount(fi, age);
  const D = mealDuration(age);
  const size = (fi / n) * (1 + randNorm(rng, 0, 0.10)); // FI noise ~10%
  return { meals: n, size: Math.max(2, size), durationMin: D };
}
