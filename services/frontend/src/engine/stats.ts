import type { StatOutput, StatResult } from '../types';

// Pen-level statistics: one-way ANOVA, Welch t, Holm correction, eta^2.
// Experimental unit = pen (not individual bird).
export interface GroupData {
  group: string;
  values: number[]; // per-pen means
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function variance(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

export function describe(g: GroupData): StatResult {
  const m = mean(g.values);
  const sd = Math.sqrt(variance(g.values));
  return {
    group: g.group,
    n: g.values.length,
    mean: Math.round(m * 100) / 100,
    sd: Math.round(sd * 100) / 100,
    se: Math.round((sd / Math.sqrt(g.values.length)) * 100) / 100,
  };
}

function welchT(a: number[], b: number[]): { t: number; df: number } {
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const sa = va / a.length;
  const sb = vb / b.length;
  const t = (ma - mb) / Math.sqrt(sa + sb);
  const df = (sa + sb) ** 2 / ((sa ** 2) / (a.length - 1) + (sb ** 2) / (b.length - 1));
  return { t, df };
}

// Approximate two-tailed p from t (normal approx for df>30; conservative)
function pFromT(t: number, df: number): number {
  const x = Math.abs(t);
  const p = Math.exp(-0.5 * x * x) * Math.sqrt(2 / Math.PI) / (x + 1 / x);
  return Math.min(1, 2 * p);
}

function holm(pvals: number[]): number[] {
  const n = pvals.length;
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adj = new Array(n).fill(0);
  let prev = 0;
  order.forEach((o, rank) => {
    const a = Math.min(1, o.p * (n - rank));
    adj[o.i] = Math.max(a, prev);
    prev = adj[o.i];
  });
  return adj;
}

export function analyze(groups: GroupData[]): StatOutput {
  const descs = groups.map(describe);
  // One-way ANOVA (between-group variance / within-group)
  const all = groups.flatMap((g) => g.values);
  const gm = mean(all);
  const k = groups.length;
  const N = all.length;
  const ssBetween = groups.reduce((s, g) => s + g.values.length * (mean(g.values) - gm) ** 2, 0);
  const ssWithin = groups.reduce((s, g) => s + g.values.reduce((a, v) => a + (v - mean(g.values)) ** 2, 0), 0);
  const dfB = k - 1;
  const dfW = N - k;
  const msB = ssBetween / dfB;
  const msW = ssWithin / dfW;
  const F = msB / msW;
  const eta2 = ssBetween / (ssBetween + ssWithin);

  // Pairwise Welch t
  const pairs: StatOutput['tests'] = [];
  const pvals: number[] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const { t } = welchT(groups[i].values, groups[j].values);
      const p = pFromT(t, groups[i].values.length + groups[j].values.length - 2);
      pvals.push(p);
      pairs.push({ groupA: groups[i].group, groupB: groups[j].group, t: Math.round(t * 100) / 100, p, padj: p, significant: false });
    }
  }
  const adj = holm(pvals);
  pairs.forEach((pr, i) => {
    pr.padj = Math.round(adj[i] * 1000) / 1000;
    pr.significant = pr.padj < 0.05;
  });

  return { anovaF: Math.round(F * 100) / 100, anovaP: Math.round(pFromT(Math.sqrt(F), dfB) * 100) / 100, eta2: Math.round(eta2 * 1000) / 1000, tests: pairs, groups: descs };
}
