/**
 * BroilerLab simulation engine — faithful TypeScript port of webapp/engine.js.
 * Pure logic, no DOM. Validated against official Aviagen/Cobb/Hubbard PO tables.
 * Used by both backend (data generation / tests) and frontend (dashboard,
 * scenarios, live runner). Keep this in sync with the validated Python baseline.
 */
import { STRAINS } from './strains';

let CUR_STRAIN = 'ross308';
export function setStrain(k: string) {
  if (STRAINS[k]) CUR_STRAIN = k;
}
function PO() {
  return STRAINS[CUR_STRAIN];
}
export const IDX15 = 14;
export const IDX60 = 59;

export function poBW(sex: 'm' | 'f' | 'ash', age: number): number {
  const P = PO();
  const a = sex === 'm' ? P.bwM : sex === 'f' ? P.bwF : P.bwAsh;
  if (age <= 1) return a[0];
  const md = P.maxDay;
  if (age >= md) return a[md - 1];
  return a[age - 1];
}
export function poFI(sex: 'm' | 'f' | 'ash', age: number): number {
  const P = PO();
  const a = sex === 'm' ? P.fiM : sex === 'f' ? P.fiF : P.fiAsh;
  const md = P.maxDay;
  age = Math.max(1, Math.min(age, md));
  for (let d = Math.min(age, md); d >= 1; d--) if (a[d - 1] != null) return a[d - 1];
  return 20;
}

/* ---------------- RNG ---------------- */
let rndState = mulberry32(308);
export function setSeed(s: number) {
  rndState = mulberry32(s);
}
function rnd() {
  return rndState();
}
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
function weibull1(k: number): number {
  return Math.pow(-Math.log(1 - rnd()), 1 / k);
}

/* ---------------- environment models ---------------- */
const L_ON = 5;
const L_OFF = 23;
export function tempForBW(w: number): number {
  const P = [
    [44, 30],
    [100, 28],
    [180, 27],
    [290, 26],
    [425, 25],
    [590, 24],
    [790, 23],
    [1015, 22],
    [1260, 21],
    [1530, 20],
  ];
  for (const [wg, t] of P) if (w <= wg) return t;
  return 20;
}
function hourWeight(h: number): number {
  if (h < L_ON || h >= L_OFF) return 0;
  const g = (mu: number, s: number) => Math.exp(-((h - mu) ** 2) / (2 * s * s));
  return g(6.5, 1.8) + g(20.5, 1.8) + 0.45 * g(13, 3.5);
}
const HOURS: number[] = [];
for (let h = L_ON; h < L_OFF; h++) HOURS.push(h);
const HCUM: number[] = (() => {
  let c = 0;
  return HOURS.map((h) => (c += hourWeight(h) + 1e-9));
})();
const HTOT = HCUM[HCUM.length - 1];
export function sampleHour(): number {
  let x = rnd() * HTOT;
  let lo = 0;
  let hi = HCUM.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (HCUM[m] < x) lo = m + 1;
    else hi = m;
  }
  return HOURS[lo] + rnd();
}

/* ---------------- behaviour engine ---------------- */
const boutLen = (age: number) => Math.min(135, 45 + 2.192 * (age - 15));
function visitPlan(fiDay: number, age: number) {
  const rate = 1 + 0.055 * (age - 15);
  const n = Math.max(6, Math.round((fiDay / rate) * (60 / boutLen(age))));
  const ws: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const w = weibull1(1.35);
    ws.push(w);
    s += w;
  }
  const plan: { t: number; meal: number; dur: number }[] = [];
  for (const w of ws) {
    const meal = (fiDay * w) / s;
    plan.push({ t: sampleHour(), meal, dur: clamp((meal / rate) * 60, 12, 240) });
  }
  plan.sort((a, b) => a.t - b.t);
  return plan;
}

/* ---------------- birds ---------------- */
class Bird {
  id: string;
  sex: 'm' | 'f';
  cv: number;
  wiggle = 0;
  alive = true;
  cumTar = 1e-9;
  cumAct = 1e-9;
  pen?: string;
  treat?: string;
  _tr: any = null;
  factor(heatActive: boolean, dT: number) {
    const f = Math.pow(clamp(this.cumAct / this.cumTar, 0.55, 1.18), 0.35);
    return f * (heatActive ? Math.exp(-0.012 * dT) : 1);
  }
  bw(age: number, nMult: number, heatActive: boolean, dT: number) {
    this.wiggle = 0.9 * this.wiggle + gauss() * 0.008;
    return (
      poBW(this.sex, age) *
      (1 + this.cv + this.wiggle) *
      nMult *
      (this._tr ? this._tr.bw(age) : 1) *
      this.factor(heatActive, dT)
    );
  }
}

/* ---------------- configuration ---------------- */
export const PENS_CFG: Record<string, { n: number }> = {
  P01: { n: 3 },
  P02: { n: 5 },
  P03: { n: 7 },
  P04: { n: 8 },
  P05: { n: 10 },
  P06: { n: 12 },
};
const BASE_DATE = new Date(Date.UTC(2026, 7, 19)); // 2026-08-19 == age 15
const BIN_CAP = 25;
const BIN_START = 18.5;
const BIN_TRIG = 3;
const DEATH_P = 0.0008;

export const TREATMENTS: Record<
  string,
  {
    label: string;
    labelEn: string;
    color: string;
    fi: (a: number) => number;
    bw: (a: number) => number;
    heat?: { from: number; to: number; dT: number };
    deathMult?: (a: number) => number;
  }
> = {
  control: { label: 'شاهد', labelEn: 'Control', color: '#8b96ad', fi: () => 1, bw: () => 1 },
  probiotic: {
    label: 'پروبیوتیک',
    labelEn: 'Probiotic',
    color: '#22d3a5',
    fi: () => 1.01,
    bw: () => 1.015,
  },
  agp: {
    label: 'افزاینده رشد',
    labelEn: 'Growth promoter',
    color: '#a78bfa',
    fi: () => 1.02,
    bw: () => 1.025,
  },
  vaccine: {
    label: 'واکسن d۱۹–۲۲',
    labelEn: 'Vaccine d19-22',
    color: '#60a5fa',
    fi: (a) => (a >= 19 && a <= 22 ? 0.9 : 1),
    bw: () => 1,
  },
  lowprot: {
    label: 'کم‌پروتئین',
    labelEn: 'Low protein',
    color: '#f59e0b',
    fi: () => 1.04,
    bw: () => 0.975,
  },
  heat: {
    label: 'تنش گرمایی d۳۲–۳۸',
    labelEn: 'Heat stress d32-38',
    color: '#ef4444',
    fi: () => 1,
    bw: () => 1,
    heat: { from: 32, to: 38, dT: 5 },
    deathMult: (a) => (a >= 32 && a <= 38 ? 2.5 : 1),
  },
};

interface NormPen {
  pid: string;
  n: number;
  treat: string;
}
function normPens(cfg: any): NormPen[] {
  if (cfg.pensCustom && cfg.pensCustom.length) {
    return cfg.pensCustom.map((p: any) => {
      const safeId = String(p.id || 'P?').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) || 'P?';
      return { pid: safeId, n: clamp(p.n | 0 || 10, 1, 400), treat: TREATMENTS[p.treat] ? p.treat : 'control' };
    });
  }
  const ids = cfg.pens && cfg.pens.length ? cfg.pens : Object.keys(PENS_CFG);
  return ids.map((id: string) => ({ pid: id, n: (PENS_CFG[id] || { n: 10 }).n, treat: 'control' }));
}

export function dateForAge(age: number, ageStart: number): string {
  const d = new Date(BASE_DATE);
  d.setUTCDate(d.getUTCDate() + age - Math.min(ageStart, 15));
  return d.toISOString().slice(0, 10);
}

export interface SimConfig {
  ageStart?: number;
  ageEnd?: number;
  pens?: string[];
  pensCustom?: { id: string; n: number; treat: string }[];
  stations?: number;
  heat?: { from: number; to: number; dT: number };
  seed?: number;
  strain?: string;
  collectRows?: boolean;
  collectVisits?: boolean;
  trackBirds?: boolean;
  penNoise?: boolean;
}

export interface SimResult {
  summaries: any[];
  diurnal: number[];
  fills: any[];
  deaths: any[];
  rows: any[] | null;
  visitsLog: any[] | null;
  birdsDaily: any[] | null;
  perPen: Record<string, any>;
  pensMeta: NormPen[];
  birdsMeta: any[];
  rowEstimate: number;
}

export function simulateRun(cfg: SimConfig): SimResult {
  const ageStart = cfg.ageStart ?? 15;
  const ageEnd = cfg.ageEnd ?? 60;
  if (cfg.strain) setStrain(cfg.strain);
  const P = PO();
  const maxAge = Math.min(ageEnd, P.maxDay);
  const pensL = normPens(cfg);
  const stations = cfg.stations || 1;
  const heat = cfg.heat || null;
  setSeed(cfg.seed ?? 308);

  const brng = mulberry32(((cfg.seed ?? 308) * 7919 + 13) | 0);
  const bgauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = brng();
    while (v === 0) v = brng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const maxN = pensL.reduce((m, p) => Math.max(m, p.n), 1);
  const sexPool: ('m' | 'f')[] = [];
  const cvPool: number[] = [];
  const penEff: number[] = [];
  for (let i = 0; i < maxN; i++) {
    sexPool.push(brng() < 0.5 ? 'm' : 'f');
    cvPool.push(Math.max(0, bgauss() * 0.05));
  }
  for (let i = 0; i < pensL.length; i++) penEff.push(bgauss() * 0.012);

  const birds: Bird[] = [];
  let bid = 0;
  for (const { pid, n, treat } of pensL) {
    for (let i = 0; i < n; i++) {
      bid++;
      const b = new Bird();
      b.id = 'B' + String(bid).padStart(3, '0');
      b.sex = sexPool[i];
      b.cv = cvPool[i];
      b.pen = pid;
      b.treat = treat;
      b._tr = TREATMENTS[treat];
      birds.push(b);
    }
  }

  const penBWmult = (n: number) => clamp(1 - 0.004 * (n - 7), 0.96, 1.03);
  const summaries: any[] = [];
  const deaths: any[] = [];
  const fills: any[] = [];
  const visitsLog: any[] | null = cfg.collectVisits ? [] : null;
  const trackBirds = !!cfg.trackBirds;
  const birdsDaily: any[] | null = trackBirds ? [] : null;
  const birdAgg = trackBirds ? new Map() : null;
  if (trackBirds) for (const b of birds) birdAgg!.set(b.id, { fi: 0, w: null });
  const diurnal = new Array(24).fill(0);
  const rows: any[] | null = cfg.collectRows ? [] : null;
  const binState: Record<string, number> = {};
  const perPen: Record<string, any> = {};
  pensL.forEach((p, pi) => {
    binState[p.pid] = BIN_START;
    perPen[p.pid] = {
      pid: p.pid,
      n: p.n,
      treat: p.treat,
      penEff: cfg.pensCustom && cfg.penNoise !== false ? +penEff[pi].toFixed(4) : 0,
      ages: [],
      bw: [],
      fi: [],
      fiPo: [],
      busy: [],
      visits: [],
      ovl: [],
      refills: [],
      bin: [],
    };
  });

  for (let age = ageStart; age <= maxAge; age++) {
    const dateStr = dateForAge(age, ageStart);
    for (const penO of pensL) {
      const pid = penO.pid;
      const n = penO.n;
      const tr = TREATMENTS[penO.treat];
      const heatNow = (tr && tr.heat) || cfg.heat || null;
      const all = birds.filter((b) => b.pen === pid);
      if (age >= 21) {
        const dm = tr && tr.deathMult ? tr.deathMult(age) : 1;
        for (const b of all) if (b.alive && rnd() < DEATH_P * dm) {
          b.alive = false;
          deaths.push({ pen: pid, id: b.id, age });
        }
      }
      const alive = all.filter((b) => b.alive);
      if (!alive.length) continue;

      const pEff = perPen[pid].penEff;
      const nMult = penBWmult(n) * (cfg.pensCustom ? 1 + pEff : 1);
      const heatActive = !!(heatNow && age >= heatNow.from && age <= heatNow.to);
      const dTnow = heatActive ? heatNow.dT : 0;
      let meanBWPot = 0;
      for (const b of alive) meanBWPot += b.bw(age, nMult, heatActive, dTnow);
      meanBWPot /= alive.length;
      const tBase = tempForBW(meanBWPot) + dTnow + gauss() * 0.3;
      const hum = clamp(58 + 0.12 * (age - ageStart) + 3 * Math.sin(((age % 30) / 30) * 6.283) + gauss() * 1.5, 45, 70);

      const visits: { t: number; b: Bird; meal: number; dur: number }[] = [];
      const hM = !heatNow || age < heatNow.from || age > heatNow.to ? 1 : Math.exp(-0.045 * heatNow.dT);
      const fiMultPen = clamp(1 + 0.005 * (n - 7), 0.94, 1.04) * tr.fi(age);
      const fiMultPen0 = clamp(1 + 0.005 * (n - 7), 0.94, 1.04);
      for (const b of alive) {
        const baseT = poFI(b.sex, age) * fiMultPen0;
        const wr = Math.pow(b.bw(age, nMult, heatActive, dTnow) / poBW(b.sex, age), 0.8);
        b.cumTar += baseT * wr;
        b.cumAct += baseT * hM * wr * (heatActive ? Math.exp(-0.04 * dTnow) : 1);
        const fiBird = baseT * fiMultPen * hM * wr * Math.exp(gauss() * 0.1);
        for (const v of visitPlan(fiBird, age)) {
          visits.push({ t: v.t, b, meal: v.meal, dur: v.dur });
          if (visitsLog)
            visitsLog.push({ p: pid, bird: b.id, age, t: v.t, dur: v.dur, meal: v.meal });
        }
      }
      visits.sort((a, b) => a.t - b.t);

      let bin = binState[pid];
      let busy = 0;
      let overlap = 0;
      let refillsToday = 0;
      const freeAt = new Array(stations).fill(-1e9);
      const dayRows: any[] | null = rows ? [] : null;

      for (const v of visits) {
        let start = Math.floor(v.t * 3600);
        let si = 0;
        for (let s = 1; s < stations; s++) if (freeAt[s] < freeAt[si]) si = s;
        if (start < freeAt[si]) {
          if (freeAt[si] - start <= 90) start = freeAt[si];
          else overlap++;
        }
        if (bin < BIN_TRIG) {
          bin = BIN_CAP;
          refillsToday++;
          fills.push({ pen: pid, age });
        }
        const end = start + Math.floor(v.dur);
        freeAt[si] = end + 2;
        busy += v.dur;
        const trueW = v.b.bw(age, nMult, heatActive, dTnow);
        if (trackBirds) {
          const A = birdAgg!.get(v.b.id);
          if (A) {
            A.fi += v.meal;
            A.w = trueW;
          }
        }
        let ema = trueW + gauss() * 3;
        let prevFrac = 0;
        const pts = [...new Set([start, (start + end) >> 1, end - 1])].sort((a, b) => a - b);
        for (const ts of pts) {
          const frac = clamp((ts - start) / Math.max(1, v.dur), prevFrac, 1);
          const newly = (frac - prevFrac) * v.meal;
          prevFrac = frac;
          const raw = Math.round(trueW + gauss() * 4);
          ema = 0.5 * ema + 0.5 * raw;
          bin -= newly / 1000;
          diurnal[Math.floor(v.t) % 24] += newly;
          if (rows) {
            let rssi = clamp(Math.round(gauss() * 5 - 65), -90, -42);
            const weak = rnd() < 0.02;
            const missing = rnd() < 0.004;
            if (weak) rssi -= 20;
            const temp = tBase - Math.sin(((ts / 3600 - 14) / 24) * 6.283);
            const hh = String(Math.floor(ts / 3600)).padStart(2, '0');
            const mm = String(Math.floor((ts % 3600) / 60)).padStart(2, '0');
            const ss = String(ts % 60).padStart(2, '0');
            dayRows!.push([
              `${dateStr} ${hh}:${mm}:${ss}`,
              'F01',
              missing ? '' : v.b.id,
              'S' + pid.slice(1),
              age,
              raw,
              Math.round(ema),
              +bin.toFixed(2),
              Math.round(-v.meal * frac),
              +temp.toFixed(1),
              +(hum + gauss() * 0.8).toFixed(1),
              rssi,
            ]);
          }
        }
      }
      binState[pid] = bin;

      let endMeanBW = 0;
      for (const b of alive) endMeanBW += b.bw(age, nMult, heatActive, dTnow);
      endMeanBW /= alive.length;
      const dayFI = visits.reduce((s, v) => s + v.meal, 0);
      const busyPct = (100 * busy) / (stations * (L_OFF - L_ON) * 3600);
      summaries.push({
        date: dateStr,
        pen: pid,
        treat: penO.treat,
        n,
        alive: alive.length,
        age,
        meanBW: endMeanBW,
        dayFI,
        fiPerBird: dayFI / alive.length,
        fiPerBirdPo: poFI('ash', age),
        visits: visits.length,
        busyPct,
        overlap,
        refills: refillsToday,
        temp: tBase,
        hum,
        binEnd: +bin.toFixed(2),
      });
      const pp = perPen[pid];
      pp.ages.push(age);
      pp.bw.push(endMeanBW);
      pp.fi.push(dayFI / alive.length);
      pp.fiPo.push(poFI('ash', age));
      pp.busy.push(busyPct);
      pp.visits.push(visits.length / n);
      pp.ovl.push(overlap);
      pp.refills.push(refillsToday);
      pp.bin.push(+bin.toFixed(2));
      if (birdsDaily)
        for (const b of alive) {
          const A = birdAgg!.get(b.id);
          birdsDaily.push({
            age,
            id: b.id,
            pen: pid,
            treat: penO.treat,
            sex: b.sex,
            cv: +b.cv.toFixed(4),
            bw: +(A!.w ?? 0).toFixed(1),
            fi: +(A!.fi).toFixed(1),
            alive: 1,
          });
        }
      if (dayRows) rows!.push(...dayRows);
    }
  }
  return {
    summaries,
    diurnal,
    fills,
    deaths,
    rows,
    visitsLog,
    birdsDaily,
    perPen,
    pensMeta: pensL,
    birdsMeta: birds.map((b) => ({ id: b.id, pen: b.pen, treat: b.treat, sex: b.sex, cv: +b.cv.toFixed(4) })),
    rowEstimate: 0,
  };
}

export function poolByAge(summaries: any[]): any[] {
  const m = new Map();
  for (const s of summaries) {
    if (!m.has(s.age)) m.set(s.age, { age: s.age, bws: [], fis: [], poFis: [], visits: [], busy: [], n: 0 });
    const r = m.get(s.age)!;
    r.bws.push(s.meanBW);
    r.fis.push(s.fiPerBird);
    r.poFis.push(s.fiPerBirdPo);
    r.visits.push(s.visits / s.alive);
    r.busy.push(s.busyPct);
    r.n++;
  }
  return [...m.values()]
    .map((r) => ({
      age: r.age,
      bw: r.bws.reduce((a: number, x: number) => a + x, 0) / r.bws.length,
      fi: r.fis.reduce((a: number, x: number) => a + x, 0) / r.fis.length,
      fiPo: r.poFis[0],
      visits: r.visits.reduce((a: number, x: number) => a + x, 0) / r.visits.length,
      busyMax: Math.max(...r.busy),
    }))
    .sort((a, b) => a.age - b.age);
}

export function maeVsPO(pooled: any[]): number {
  let s = 0;
  let c = 0;
  for (const r of pooled) {
    if (r.age < IDX15 + 1) continue;
    s += Math.abs((100 * (r.bw - poBW('ash', r.age))) / poBW('ash', r.age));
    c++;
  }
  return c ? s / c : 0;
}

export function windowFCR(pp: any): number {
  const gain = pp.bw[pp.bw.length - 1] - pp.bw[0];
  return pp.fi.reduce((a: number, x: number) => a + x, 0) / gain;
}

export function rowsToCSV(rows: any[]): string {
  const guard = (v: any) => {
    const st = String(v);
    return /^[=+@]|^-[^0-9.]/.test(st) ? "'" + st : st;
  };
  const head =
    'timestamp,flock_id,bird_id,sensor_id,age_day,raw_weight_g,weight_g,feed_bin_kg,feed_delta_g,temp_c,humidity,rssi';
  return head + '\n' + rows.map((r) => r.map((c: any) => guard(c)).join(',')).join('\n');
}
