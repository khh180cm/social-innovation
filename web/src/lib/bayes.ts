// discounted Beta-Binomial + 계층(코호트) prior 예측 엔진.
//
// - 시행 단위 = 주(週): 각 주가 1 effective trial, 출석분율 f=attended/total 로 부분성공 가중.
//   (시간을 독립 trial로 보면 과신 → 신용구간 비현실적으로 좁아짐. 그래서 주 단위.)
// - 계층 prior: 코호트 attendance 로 empirical Bayes(method of moments) → 콜드스타트 풀링.
// - 할인(λ): 최근 주에 기하 가중(λ^k) → 5주차 regime shift / 하락 추세를 흡수.
// - posterior → 최종 블록 출석률 예측분포 → 구간별 P(tier) → 기대수당·P(미지급)·신용구간.

import { Track, tierIndex, amountFor, TIER_LOWER_BOUNDS, BLOCK_WEEKS } from "./rules";
import type { WeekRow } from "./data";

export const LAMBDA = 0.8; // 할인계수 (유효 기억 ≈ 1/(1-λ) ≈ 5주)
const PRIOR_STRENGTH_CAP = 8; // 풀링 prior 최대 pseudo-week
const PRIOR_STRENGTH_FLOOR = 2;

function att(w: WeekRow, t: Track) {
  return t === "job_training" ? w.jtAttended : w.weAttended;
}
function tot(w: WeekRow, t: Track) {
  return t === "job_training" ? w.jtTotal : w.weTotal;
}

// ── 수치: 정규화 불완전 베타 I_x(a,b) = Beta CDF ───────────────────────────
function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200,
    EPS = 3e-12,
    FPMIN = 1e-300;
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1,
    d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) + lbeta);
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a;
  return 1 - (front * betacf(b, a, 1 - x)) / b;
}

export function betaQuantile(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (regIncBeta(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── 계층 prior (코호트 empirical Bayes, method of moments) ──────────────────
export interface BetaPrior {
  a0: number;
  b0: number;
}

export function cohortPrior(
  poolWeeks: WeekRow[][],
  track: Track,
  uploaded: number
): BetaPrior {
  const means: number[] = [];
  for (const weeks of poolWeeks) {
    const obs = weeks.filter((w) => w.week <= uploaded);
    const a = obs.reduce((s, w) => s + att(w, track), 0);
    const t = obs.reduce((s, w) => s + tot(w, track), 0);
    if (t > 0) means.push(a / t);
  }
  if (means.length === 0) return { a0: 1, b0: 1 };
  const m = means.reduce((s, x) => s + x, 0) / means.length;
  const v =
    means.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, means.length);
  let kappa = PRIOR_STRENGTH_CAP;
  if (v > 1e-6 && m > 0 && m < 1) {
    kappa = Math.min(PRIOR_STRENGTH_CAP, Math.max(PRIOR_STRENGTH_FLOOR, (m * (1 - m)) / v - 1));
  }
  return { a0: Math.max(0.05, m * kappa), b0: Math.max(0.05, (1 - m) * kappa) };
}

// ── 할인 posterior over p (참여자×트랙, 업로드된 모든 주) ────────────────────
export interface Posterior {
  a: number;
  b: number;
  mean: number;
}

export function posterior(
  weeks: WeekRow[],
  track: Track,
  uploaded: number,
  prior: BetaPrior,
  lambda = LAMBDA
): Posterior {
  let a = prior.a0;
  let b = prior.b0;
  for (let w = 1; w <= uploaded; w++) {
    const row = weeks.find((x) => x.week === w);
    if (!row) continue;
    const total = tot(row, track);
    if (total <= 0) continue;
    const f = att(row, track) / total;
    const wgt = Math.pow(lambda, uploaded - w); // 최근일수록 1, 과거일수록 λ^k
    a += wgt * f;
    b += wgt * (1 - f);
  }
  return { a, b, mean: a / (a + b) };
}

// ── 블록 최종 출석률 예측분포 → tier 확률 ──────────────────────────────────
export interface BlockForecast {
  settled: boolean;
  expRate: number;
  credLoRate: number;
  credHiRate: number;
  pTier: number[]; // [tier0..tier4] 확률
  expWage: number;
  pUnpaid: number; // = pTier[4]
  wageLo: number;
  wageHi: number;
}

export function forecastBlock(
  weeks: WeekRow[],
  track: Track,
  block: 1 | 2,
  uploaded: number,
  post: Posterior
): BlockForecast {
  const bw = weeks.filter((w) => BLOCK_WEEKS[block].includes(w.week));
  const blockTotal = bw.reduce((s, w) => s + tot(w, track), 0);
  const obsAtt = bw
    .filter((w) => w.week <= uploaded)
    .reduce((s, w) => s + att(w, track), 0);
  const remTotal = bw
    .filter((w) => w.week > uploaded)
    .reduce((s, w) => s + tot(w, track), 0);

  // 정산 완료(남은 회차 0) → 확정
  if (remTotal === 0) {
    const r = blockTotal > 0 ? obsAtt / blockTotal : 0;
    const amt = amountFor(track, tierIndex(r));
    const pTier = [0, 0, 0, 0, 0];
    pTier[tierIndex(r)] = 1;
    return {
      settled: true,
      expRate: r,
      credLoRate: r,
      credHiRate: r,
      pTier,
      expWage: amt,
      pUnpaid: r < 0.5 ? 1 : 0,
      wageLo: amt,
      wageHi: amt,
    };
  }

  const { a, b, mean } = post;
  // 최종률 ≥ t  ⟺  p ≥ (t·blockTotal − obsAtt)/remTotal
  const pAtLeast = (t: number) => {
    const pt = (t * blockTotal - obsAtt) / remTotal;
    if (pt <= 0) return 1;
    if (pt >= 1) return 0;
    return 1 - regIncBeta(pt, a, b);
  };
  // 구간 하한(rules.TIER_LOWER_BOUNDS = [0.9,0.7,0.6,0.5])에서 P(최종률≥하한) 누적확률
  const g = TIER_LOWER_BOUNDS.map(pAtLeast); // [g90, g70, g60, g50]
  const pTier = [
    g[0],
    g[1] - g[0],
    g[2] - g[1],
    g[3] - g[2],
    1 - g[3],
  ].map((x) => Math.max(0, x));
  const expWage = pTier.reduce((s, p, i) => s + p * amountFor(track, i), 0);

  const rateOf = (p: number) => (obsAtt + p * remTotal) / blockTotal;
  const expRate = rateOf(mean);
  const credLoRate = rateOf(betaQuantile(0.1, a, b));
  const credHiRate = rateOf(betaQuantile(0.9, a, b));

  return {
    settled: false,
    expRate,
    credLoRate,
    credHiRate,
    pTier,
    expWage,
    pUnpaid: pTier[4],
    wageLo: amountFor(track, tierIndex(credLoRate)),
    wageHi: amountFor(track, tierIndex(credHiRate)),
  };
}

// 최근 가중 출석 추세 (할인 가중평균의 주간 변화) → 'up' | 'flat' | 'down'
export function trendOf(
  weeks: WeekRow[],
  uploaded: number,
  lambda = LAMBDA
): "up" | "flat" | "down" {
  if (uploaded < 2) return "flat";
  const wmean = (N: number) => {
    let num = 0,
      den = 0;
    for (let w = 1; w <= N; w++) {
      const row = weeks.find((x) => x.week === w);
      if (!row) continue;
      const t = row.jtTotal + row.weTotal;
      if (t <= 0) continue;
      const f = (row.jtAttended + row.weAttended) / t;
      const g = Math.pow(lambda, N - w);
      num += g * f;
      den += g;
    }
    return den > 0 ? num / den : 0;
  };
  const d = wmean(uploaded) - wmean(uploaded - 1);
  if (d <= -0.02) return "down";
  if (d >= 0.02) return "up";
  return "flat";
}
