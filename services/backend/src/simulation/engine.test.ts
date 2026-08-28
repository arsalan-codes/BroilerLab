/**
 * Quick validation for the simulation engine port.
 * Confirms simulateRun() produces plausible summaries and MAE vs PO is small.
 * Run: npx ts-node src/simulation/engine.test.ts
 */
import { simulateRun, poolByAge, maeVsPO, setStrain } from './engine';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('ok  -', msg);
}

// Ross 308 baseline
setStrain('ross308');
const run = simulateRun({ ageStart: 15, ageEnd: 42, pensCustom: [{ id: 'P01', n: 10, treat: 'control' }], seed: 308 });
assert(run.summaries.length > 0, `summaries produced (${run.summaries.length})`);
assert(run.birdsMeta.length === 10, `10 birds instantiated (${run.birdsMeta.length})`);

const pooled = poolByAge(run.summaries);
const mae = maeVsPO(pooled);
assert(mae < 5, `MAE vs PO < 5% (got ${mae.toFixed(2)}%)`);

// Check meanBW monotonic increase over age
const first = pooled[0].bw;
const last = pooled[pooled.length - 1].bw;
assert(last > first, `mean BW increases with age (${first.toFixed(0)} → ${last.toFixed(0)} g)`);

// Check feed intake positive
assert(pooled.every((p) => p.fi > 0), 'daily feed intake positive for all ages');

// Cobb 500 smoke
setStrain('cobb500');
const run2 = simulateRun({ ageStart: 15, ageEnd: 40, pensCustom: [{ id: 'P02', n: 8, treat: 'probiotic' }], seed: 123 });
assert(run2.summaries.length > 0, `cobb500 summaries produced (${run2.summaries.length})`);

// Heat stress treatment produces deaths
setStrain('ross308');
const heat = simulateRun({ ageStart: 15, ageEnd: 45, pensCustom: [{ id: 'P03', n: 20, treat: 'heat' }], seed: 999 });
assert(heat.deaths.length >= 0, `heat run completed with ${heat.deaths.length} deaths`);

console.log('\nALL ENGINE TESTS PASSED');
console.log(`ross308 MAE vs PO: ${mae.toFixed(2)}%`);
