/**
 * Vitest suite for the simulation engine port.
 * Confirms simulateRun() produces plausible summaries and MAE vs PO is small.
 * Run: npm test
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { simulateRun, poolByAge, maeVsPO, setStrain } from './engine';

describe('simulation engine', () => {
  let run: ReturnType<typeof simulateRun>;
  let pooled: ReturnType<typeof poolByAge>;
  let mae: number;

  beforeAll(() => {
    // Ross 308 baseline
    setStrain('ross308');
    run = simulateRun({
      ageStart: 15,
      ageEnd: 42,
      pensCustom: [{ id: 'P01', n: 10, treat: 'control' }],
      seed: 308,
    });
    pooled = poolByAge(run.summaries);
    mae = maeVsPO(pooled);
  });

  it('produces summaries and instantiates 10 birds (ross308)', () => {
    expect(run.summaries.length).toBeGreaterThan(0);
    expect(run.birdsMeta.length).toBe(10);
  });

  it('has small MAE vs PO (< 5%)', () => {
    expect(mae).toBeLessThan(5);
  });

  it('increases mean BW with age', () => {
    const first = pooled[0].bw;
    const last = pooled[pooled.length - 1].bw;
    expect(last).toBeGreaterThan(first);
  });

  it('has positive daily feed intake for all ages', () => {
    expect(pooled.every((p) => p.fi > 0)).toBe(true);
  });

  it('simulates cobb500 smoke run', () => {
    setStrain('cobb500');
    const run2 = simulateRun({
      ageStart: 15,
      ageEnd: 40,
      pensCustom: [{ id: 'P02', n: 8, treat: 'probiotic' }],
      seed: 123,
    });
    expect(run2.summaries.length).toBeGreaterThan(0);
  });

  it('completes heat-stress run', () => {
    setStrain('ross308');
    const heat = simulateRun({
      ageStart: 15,
      ageEnd: 45,
      pensCustom: [{ id: 'P03', n: 20, treat: 'heat' }],
      seed: 999,
    });
    expect(heat.deaths.length).toBeGreaterThanOrEqual(0);
  });
});
