import type { StrainKey, ValidationResult, ValidationRow } from '../types';
import { catalogBW, catalogFI, catalogFCR } from './strains';
import { makeBird, GrowthEngine } from './growth';

// Validate simulation vs active strain catalog.
// MAE = mean absolute error between daily simulated weight and catalog weight.
// FCR = cumulative feed intake / weight gain over window d15..end.
export function validate(strain: StrainKey, seed: number, startDay = 15, endDay = 60, penCount = 6, birdsPerPen = 12): ValidationResult {
  const rows: ValidationRow[] = [];
  let absSum = 0;
  let n = 0;
  let cumFi = 0;
  let startWSum = 0;
  let endWSum = 0;
  let totalBirds = penCount * birdsPerPen;

  // Build persistent birds (one GrowthEngine each, deterministic across days)
  const birds: GrowthEngine[] = [];
  for (let p = 0; p < penCount; p++) {
    for (let b = 0; b < birdsPerPen; b++) {
      const bird = makeBird(`P${p + 1}`, p * birdsPerPen + b, seed, b % 2 === 0 ? 'm' : 'f', 'control');
      birds.push(new GrowthEngine(bird));
    }
  }

  for (let day = startDay; day <= endDay; day++) {
    let simSum = 0;
    for (const ge of birds) {
      const w = ge.weightAt(strain, day);
      simSum += w;
      if (day === startDay) startWSum += w;
      if (day === endDay) endWSum += w;
    }
    const simAvg = simSum / totalBirds;
    const po = catalogBW(strain, day);
    const fi = catalogFI(strain, day);
    cumFi += fi * totalBirds;
    absSum += Math.abs(simAvg - po);
    n++;
    rows.push({
      day,
      sim: Math.round(simAvg),
      po: Math.round(po),
      dev: Math.round(((simAvg - po) / po) * 1000) / 10,
      fiSim: Math.round(fi),
      fiPo: Math.round(fi),
      status: Math.abs((simAvg - po) / po) < 0.03 ? 'OK' : 'warn',
    });
  }
  const mae = absSum / n;
  const gain = endWSum - startWSum;
  const fcr = gain > 0 ? cumFi / gain : 0;
  return {
    rows,
    mae: Math.round(mae * 10) / 10,
    fcr: Math.round(fcr * 100) / 100,
    finalBw: Math.round(endWSum / totalBirds),
    dailyIntake: Math.round(catalogFI(strain, endDay)),
  };
}
