import type { Experiment, ScenarioResult, StrainKey } from '../types';
import { catalogBW, catalogFI } from './strains';
import { makeBird, GrowthEngine, treatmentModifiers } from './growth';
import { mulberry32 } from './rng';

// Heat scenario: FI * exp(-0.045*deltaT) during wave + direct weight penalty ~1.2%/°C.
// Station scenario: compare 1 vs 2 stations (saturation effect).
export function runScenario(
  exp: Experiment,
  strain: StrainKey,
  seed: number,
  kind: 'heat' | 'stn',
  params: { fromDay: number; days: number; deltaT: number; stations: 1 | 2 },
): ScenarioResult {
  const baseGrowth: number[] = [];
  const scnGrowth: number[] = [];
  const baseFi: number[] = [];
  const scnFi: number[] = [];

  for (let day = 15; day <= 60; day++) {
    let baseSum = 0;
    let scnSum = 0;
    let baseFiSum = 0;
    let scnFiSum = 0;
    for (const pen of exp.pens) {
      let bwBase = 0;
      let bwScn = 0;
      let fiBase = 0;
      let fiScn = 0;
      for (let b = 0; b < pen.birdCount; b++) {
        const bird = makeBird(pen.id, b, seed, b % 2 === 0 ? 'm' : 'f', pen.treatment);
        const ge = new GrowthEngine(bird);
        const wBase = ge.weightAt(strain, day);
        bwBase += wBase;
        fiBase += catalogFI(strain, day);
        let wScn = wBase;
        let fScn = catalogFI(strain, day);
        if (kind === 'heat' && day >= params.fromDay && day < params.fromDay + params.days) {
          fScn *= Math.exp(-0.045 * params.deltaT);
          const directPenalty = 1 - 0.012 * params.deltaT;
          wScn = wBase * directPenalty;
        } else if (kind === 'heat' && day >= params.fromDay + params.days && day < params.fromDay + params.days + 6) {
          // partial recovery after wave
          const directPenalty = 1 - 0.012 * params.deltaT * 0.4;
          wScn = wBase * directPenalty;
        }
        if (kind === 'stn' && params.stations === 2) {
          fScn *= 1.02;
          wScn = wBase * 1.01;
        }
        bwScn += wScn;
        fiScn += fScn;
      }
      baseSum += bwBase;
      scnSum += bwScn;
      baseFiSum += fiBase;
      scnFiSum += fiScn;
    }
    baseGrowth.push(Math.round(baseSum / exp.pens.reduce((a, p) => a + p.birdCount, 0)));
    scnGrowth.push(Math.round(scnSum / exp.pens.reduce((a, p) => a + p.birdCount, 0)));
    baseFi.push(Math.round(baseFiSum / exp.pens.reduce((a, p) => a + p.birdCount, 0)));
    scnFi.push(Math.round(scnFiSum / exp.pens.reduce((a, p) => a + p.birdCount, 0)));
  }

  // Build per-pen rows (once, using avg across birds — not per day)
  const penRows: ScenarioResult['penRows'] = exp.pens.map((pen) => {
    const bird = makeBird(pen.id, 0, seed, 'm', pen.treatment);
    const ge = new GrowthEngine(bird);
    const dayMid = Math.floor((15 + 60) / 2);
    const bwBase = ge.weightAt(strain, dayMid);
    let bwScn = bwBase;
    let fcrBase = 1.5;
    let fcrScn = 1.5;
    if (kind === 'heat') {
      bwScn = bwBase * (1 - 0.012 * params.deltaT);
      fcrScn = 1.5 * Math.exp(0.045 * params.deltaT);
    }
    if (kind === 'stn' && params.stations === 2) {
      bwScn = bwBase * 1.01;
      fcrScn = 1.5 * 0.98;
    }
    return {
      pen: pen.id,
      n: pen.birdCount,
      bwBase: Math.round(bwBase),
      bwScn: Math.round(bwScn),
      dPct: Math.round(((bwScn - bwBase) / bwBase) * 1000) / 10,
      fcrBase: Math.round(fcrBase * 100) / 100,
      fcrScn: Math.round(fcrScn * 100) / 100,
      busyBase: params.stations === 1 ? 0.82 : 0.55,
      busyScn: params.stations === 1 ? 0.82 : 0.55,
    };
  });
  const dBw = Math.round(scnGrowth.reduce((a, v, i) => a + (v - baseGrowth[i]), 0) / scnGrowth.length);
  const dip = Math.min(...scnGrowth.map((v, i) => v - baseGrowth[i]));
  const dFcr = Math.round((penRows[0].fcrScn - penRows[0].fcrBase) * 1000) / 1000;
  const dBusy = Math.max(...penRows.map((p) => Math.abs(p.busyScn - p.busyBase)));
  return { dBw, dip, dFcr, dBusy, baseGrowth, scnGrowth, baseFi, scnFi, penRows };
}
