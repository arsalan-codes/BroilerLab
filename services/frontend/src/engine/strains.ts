import type { StrainCatalog, StrainKey } from '../types';

// Catalog points are representative daily BW (g) and Feed Intake (g/day) for male+female
// and target FCR. Sourced from official performance objectives (Ross 308 2007, Cobb 500 2022,
// AA+ 2022, Hubbard EP 2019). Values are calibration-grade, not exact per-day extracts.
// Horizon = BW evaluation day.
export const STRAINS: Record<StrainKey, StrainCatalog> = {
  ross308: {
    key: 'ross308',
    name: 'Ross 308',
    bwHorizon: 42,
    points: build([200, 540, 1070, 1720, 2440, 3080, 3650, 4150, 4580], [185, 500, 990, 1600, 2280, 2880, 3420, 3900, 4310], [33, 58, 92, 123, 150, 173, 192, 209, 224], [1.45, 1.46, 1.47, 1.49, 1.51, 1.54, 1.57, 1.60, 1.63]),
  },
  cobb500: {
    key: 'cobb500',
    name: 'Cobb 500',
    bwHorizon: 42,
    points: build([205, 545, 1085, 1750, 2470, 3110, 3670, 4150, 4560], [190, 505, 1000, 1625, 2310, 2910, 3440, 3900, 4290], [32, 57, 91, 122, 149, 172, 191, 207, 222], [1.42, 1.43, 1.45, 1.47, 1.49, 1.52, 1.55, 1.58, 1.61]),
  },
  aaplus: {
    key: 'aaplus',
    name: 'Arbor Acres Plus',
    bwHorizon: 42,
    points: build([195, 530, 1050, 1690, 2400, 3030, 3580, 4070, 4490], [180, 490, 970, 1570, 2240, 2830, 3360, 3830, 4230], [34, 59, 93, 124, 151, 174, 193, 210, 225], [1.46, 1.47, 1.48, 1.50, 1.52, 1.55, 1.58, 1.61, 1.64]),
  },
  hubbardep: {
    key: 'hubbardep',
    name: 'Hubbard EP',
    bwHorizon: 42,
    points: build([198, 538, 1065, 1715, 2430, 3060, 3620, 4110, 4530], [183, 498, 985, 1600, 2270, 2870, 3400, 3870, 4270], [33, 58, 92, 123, 150, 173, 192, 209, 223], [1.44, 1.45, 1.46, 1.48, 1.50, 1.53, 1.56, 1.59, 1.62]),
  },
};

function build(bwM: number[], bwF: number[], fiM: number[], fcr: number[]): StrainCatalog['points'] {
  const days = [7, 14, 21, 28, 35, 39, 42, 45, 49];
  return days.map((day, i) => ({
    day,
    bwM: bwM[i],
    bwF: bwF[i],
    fiM: fiM[i],
    fiF: fiM[i] * 0.93,
    fcr: fcr[i],
  }));
}

// Linear interpolation of catalog BW for a given age (averages male/female)
export function catalogBW(strain: StrainKey, age: number): number {
  const pts = STRAINS[strain].points;
  const avg = (p: { bwM: number; bwF: number }) => (p.bwM + p.bwF) / 2;
  if (age <= pts[0].day) return avg(pts[0]);
  if (age >= pts[pts.length - 1].day) return avg(pts[pts.length - 1]);
  for (let i = 1; i < pts.length; i++) {
    if (age <= pts[i].day) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (age - a.day) / (b.day - a.day);
      return avg(a) + t * (avg(b) - avg(a));
    }
  }
  return avg(pts[pts.length - 1]);
}

export function catalogFI(strain: StrainKey, age: number): number {
  const pts = STRAINS[strain].points;
  const avg = (p: { fiM: number; fiF: number }) => (p.fiM + p.fiF) / 2;
  if (age <= pts[0].day) return avg(pts[0]);
  if (age >= pts[pts.length - 1].day) return avg(pts[pts.length - 1]);
  for (let i = 1; i < pts.length; i++) {
    if (age <= pts[i].day) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (age - a.day) / (b.day - a.day);
      return avg(a) + t * (avg(b) - avg(a));
    }
  }
  return avg(pts[pts.length - 1]);
}

export function catalogFCR(strain: StrainKey, age: number): number {
  const pts = STRAINS[strain].points;
  if (age <= pts[0].day) return pts[0].fcr;
  if (age >= pts[pts.length - 1].day) return pts[pts.length - 1].fcr;
  for (let i = 1; i < pts.length; i++) {
    if (age <= pts[i].day) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (age - a.day) / (b.day - a.day);
      return a.fcr + t * (b.fcr - a.fcr);
    }
  }
  return pts[pts.length - 1].fcr;
}
