import { describe, it, expect } from 'vitest';
import { mulberry32, randNorm } from './rng';
import { validate } from './validation';
import { makeBird, GrowthEngine } from './growth';
import { mealCount, mealDuration } from './meal';
import { FeedBin, rfidRead } from './sensor';
import { runScenario } from './scenario';
import { analyze } from './stats';
import type { Experiment } from '../types';

describe('RNG determinism', () => {
  it('same seed => same sequence', () => {
    const a = mulberry32(308);
    const b = mulberry32(308);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('different seeds differ', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});

describe('Growth model', () => {
  it('weight is positive and within plausible range for Ross308 d42', () => {
    const b = makeBird('P01', 0, 308, 'm', 'control');
    const w = new GrowthEngine(b).weightAt('ross308', 42);
    expect(w).toBeGreaterThan(2000);
    expect(w).toBeLessThan(5000);
  });
  it('deterministic for same bird+seed', () => {
    const b1 = makeBird('P01', 0, 308, 'm', 'control');
    const b2 = makeBird('P01', 0, 308, 'm', 'control');
    const g1 = new GrowthEngine(b1);
    const g2 = new GrowthEngine(b2);
    expect(g1.weightAt('ross308', 30)).toBeCloseTo(g2.weightAt('ross308', 30), 1);
  });
});

describe('Validation', () => {
  it('MAE is small (<5% of catalog weight)', () => {
    const v = validate('ross308', 308, 15, 42, 6, 12);
    expect(v.mae).toBeLessThan(250);
    expect(v.finalBw).toBeGreaterThan(3000);
    expect(v.finalBw).toBeLessThan(4200);
  });
  it('deterministic: same seed => same MAE', () => {
    const v1 = validate('ross308', 308, 15, 42, 6, 12);
    const v2 = validate('ross308', 308, 15, 42, 6, 12);
    expect(v1.mae).toBe(v2.mae);
  });
});

describe('Meal model', () => {
  it('mealCount >= 6', () => {
    expect(mealCount(100, 30)).toBeGreaterThanOrEqual(6);
  });
  it('mealDuration capped at 135', () => {
    expect(mealDuration(60)).toBe(135);
    expect(mealDuration(20)).toBeLessThan(135);
  });
});

describe('Sensor', () => {
  it('FeedBin refills at threshold', () => {
    const bin = new FeedBin(3.5);
    const { refilled } = bin.consume(1000); // drop 1kg -> 2.5kg -> refill
    expect(refilled).toBe(true);
    expect(bin.kg).toBe(25);
  });
  it('RFID read mostly succeeds', () => {
    const rng = mulberry32(123);
    let ok = 0;
    for (let i = 0; i < 1000; i++) if (rfidRead(rng).ok) ok++;
    expect(ok).toBeGreaterThan(950); // ~99.6%
  });
});

describe('Scenario', () => {
  it('heat reduces final weight', () => {
    const exp: Experiment = { seed: 308, pens: [
      { id: 'P01', birdCount: 12, treatment: 'control' },
      { id: 'P02', birdCount: 12, treatment: 'heat' },
    ]};
    const s = runScenario(exp, 'ross308', 308, 'heat', { fromDay: 32, days: 7, deltaT: 5, stations: 1 });
    expect(s.penRows.length).toBe(2);
    expect(s.dBw).toBeLessThan(0); // heat lowers weight
  });
});

describe('Statistics', () => {
  it('ANOVA produces f and p', () => {
    const groups = [
      { group: 'A', values: [2400, 2450, 2380] },
      { group: 'B', values: [2520, 2480, 2510] },
    ];
    const r = analyze(groups);
    expect(r.anovaF).toBeGreaterThan(0);
    expect(r.eta2).toBeGreaterThan(0);
    expect(r.tests.length).toBe(1);
  });
});
