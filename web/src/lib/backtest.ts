// 예측 필터 백테스트 — 각 주 w를 "이전 주(1..w-1)만으로" 예측 → 실제와 비교.
// 세 필터 비교: naive(누적평균) / EWMA / 우리(discounted Beta-Binomial + 코호트 prior).
// "어떤 필터가 정확한가"(발표 1단계)의 증거.

import type { WeekRow } from "./data";

function weekRate(w: WeekRow | undefined): number | null {
  if (!w) return null;
  const t = w.jtTotal + w.weTotal;
  return t > 0 ? (w.jtAttended + w.weAttended) / t : null;
}

function cohortBetaPrior(seqs: number[][]): { a0: number; b0: number } {
  const means = seqs
    .map((s) => (s.length ? s.reduce((a, b) => a + b, 0) / s.length : null))
    .filter((x): x is number => x !== null);
  if (!means.length) return { a0: 1, b0: 1 };
  const m = means.reduce((a, b) => a + b, 0) / means.length;
  const v =
    means.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, means.length);
  let kappa = 8;
  if (v > 1e-6 && m > 0 && m < 1)
    kappa = Math.min(8, Math.max(2, (m * (1 - m)) / v - 1));
  return { a0: Math.max(0.05, m * kappa), b0: Math.max(0.05, (1 - m) * kappa) };
}

const naive = (seq: number[]) => seq.reduce((a, b) => a + b, 0) / seq.length;
function ewma(seq: number[], lam: number) {
  let num = 0,
    den = 0;
  const n = seq.length;
  for (let k = 0; k < n; k++) {
    const g = Math.pow(lam, n - 1 - k);
    num += g * seq[k];
    den += g;
  }
  return num / den;
}
function betaMean(a0: number, b0: number, seq: number[], lam: number) {
  let a = a0,
    b = b0;
  const n = seq.length;
  for (let k = 0; k < n; k++) {
    const g = Math.pow(lam, n - 1 - k);
    a += g * seq[k];
    b += g * (1 - seq[k]);
  }
  return a / (a + b);
}

export interface BacktestResult {
  available: boolean;
  n: number;
  mae: { naive: number; ewma: number; ours: number };
  perWeek: { week: number; naive: number; ewma: number; ours: number }[];
}

export function backtest(
  poolWeeks: WeekRow[][],
  uploaded: number,
  lambda = 0.8,
  ewmaLambda = 0.6
): BacktestResult {
  const perWeek: BacktestResult["perWeek"] = [];
  let sN = 0,
    sE = 0,
    sO = 0,
    cnt = 0;

  for (let w = 2; w <= uploaded; w++) {
    const seqs = poolWeeks.map((weeks) => {
      const s: number[] = [];
      for (let k = 1; k < w; k++) {
        const r = weekRate(weeks.find((x) => x.week === k));
        if (r !== null) s.push(r);
      }
      return s;
    });
    const prior = cohortBetaPrior(seqs);
    let wN = 0,
      wE = 0,
      wO = 0,
      wc = 0;
    poolWeeks.forEach((weeks, i) => {
      const actual = weekRate(weeks.find((x) => x.week === w));
      const seq = seqs[i];
      if (actual === null || seq.length === 0) return;
      wN += Math.abs(naive(seq) - actual);
      wE += Math.abs(ewma(seq, ewmaLambda) - actual);
      wO += Math.abs(betaMean(prior.a0, prior.b0, seq, lambda) - actual);
      wc += 1;
    });
    if (wc > 0) {
      perWeek.push({ week: w, naive: wN / wc, ewma: wE / wc, ours: wO / wc });
      sN += wN;
      sE += wE;
      sO += wO;
      cnt += wc;
    }
  }

  return {
    available: cnt > 0,
    n: cnt,
    mae: {
      naive: cnt ? sN / cnt : 0,
      ewma: cnt ? sE / cnt : 0,
      ours: cnt ? sO / cnt : 0,
    },
    perWeek,
  };
}
