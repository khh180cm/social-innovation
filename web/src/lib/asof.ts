// as-of 인지 엔진 — 업로드된 N주만 관측, 나머지는 discounted Beta-Binomial 예측.

import { Track, maxAmountFor } from "./rules";
import type { WeekRow } from "./data";
import { projectParticipant } from "./projection";
import type { MotivKey } from "./ui";
import {
  BetaPrior,
  Posterior,
  posterior,
  forecastBlock,
  trendOf,
} from "./bayes";

const TRACKS: Track[] = ["job_training", "work_experience"];
const BLOCK_WEEKS: Record<1 | 2, number[]> = { 1: [1, 2, 3, 4], 2: [5, 6, 7, 8] };

export type Prior = Record<Track, BetaPrior>;
export type BlockState = "settled" | "progress" | "not_started";
export type Urgency = 1 | 2 | 3 | 4;
export type Trend = "up" | "flat" | "down";

export interface DisplayCell {
  track: Track;
  block: 1 | 2;
  state: BlockState;
  rate: number | null;
}

export interface AsOfView {
  id: number;
  uploaded: number;
  currentBlock: 1 | 2;
  urgency: Urgency;
  motiv: MotivKey;
  messages: string[];
  display: DisplayCell[];
  settledAmount: number;
  expectedAmount: number; // 기대 수당
  credLo: number; // 80% 신용 하한
  credHi: number;
  maxAmount: number;
  pUnpaidNext: number; // 다음 정산 미지급 확률 (조기경보)
  postMean: number; // 출석 propensity 추정 (트랙 평균)
  trend: Trend;
  fully: boolean;
  priority: number;
}

function obsBlockRate(
  weeks: WeekRow[],
  track: Track,
  block: 1 | 2,
  uploaded: number
): number | null {
  const bw = weeks.filter(
    (w) => BLOCK_WEEKS[block].includes(w.week) && w.week <= uploaded
  );
  const a = bw.reduce(
    (s, w) => s + (track === "job_training" ? w.jtAttended : w.weAttended),
    0
  );
  const t = bw.reduce(
    (s, w) => s + (track === "job_training" ? w.jtTotal : w.weTotal),
    0
  );
  return t > 0 ? a / t : null;
}

export function viewAsOf(
  id: number,
  weeks: WeekRow[],
  uploaded: number,
  prior: Prior
): AsOfView {
  const currentBlock: 1 | 2 = uploaded <= 4 ? 1 : 2;
  const proj = projectParticipant(weeks, uploaded);
  const posts: Record<Track, Posterior> = {
    job_training: posterior(weeks, "job_training", uploaded, prior.job_training),
    work_experience: posterior(
      weeks,
      "work_experience",
      uploaded,
      prior.work_experience
    ),
  };

  let settledAmount = 0;
  let expectedAmount = 0;
  let credLo = 0;
  let credHi = 0;
  let maxAmount = 0;
  let settledUnpaid = false;
  const display: DisplayCell[] = [];
  const pUnpaidByBlock: Record<1 | 2, Record<Track, number>> = {
    1: { job_training: 0, work_experience: 0 },
    2: { job_training: 0, work_experience: 0 },
  };

  for (const block of [1, 2] as const) {
    const started = uploaded >= BLOCK_WEEKS[block][0];
    for (const track of TRACKS) {
      maxAmount += maxAmountFor(track);
      const fc = forecastBlock(weeks, track, block, uploaded, posts[track]);
      expectedAmount += fc.expWage;
      credLo += fc.wageLo;
      credHi += fc.wageHi;
      pUnpaidByBlock[block][track] = fc.pUnpaid;
      if (fc.settled) {
        settledAmount += fc.expWage;
        if (fc.pUnpaid === 1) settledUnpaid = true;
      }
      display.push({
        track,
        block,
        state: fc.settled ? "settled" : started ? "progress" : "not_started",
        rate: fc.settled
          ? fc.expRate
          : started
          ? obsBlockRate(weeks, track, block, uploaded)
          : null,
      });
    }
  }

  // 다음 정산 블록 = 아직 정산 안 된 첫 블록
  const focusBlock: 1 | 2 | null =
    uploaded < 4 ? 1 : uploaded < 8 ? 2 : null;
  const pUnpaidNext = focusBlock
    ? 1 -
      (1 - pUnpaidByBlock[focusBlock].job_training) *
        (1 - pUnpaidByBlock[focusBlock].work_experience)
    : 0;

  const postMean =
    (posts.job_training.mean + posts.work_experience.mean) / 2;
  const trend = trendOf(weeks, uploaded);

  // 긴급도 = 위험(P미지급) 중심 + 추세·출석추정 보조. 저위험은 '안정'이 기본.
  let urgency: Urgency;
  if (settledUnpaid || pUnpaidNext >= 0.5 || postMean < 0.5) urgency = 1;
  else if (pUnpaidNext >= 0.2 || (trend === "down" && postMean < 0.75))
    urgency = 2;
  else if (pUnpaidNext >= 0.05 || trend === "down" || postMean < 0.72)
    urgency = 3;
  else urgency = 4;

  return {
    id,
    uploaded,
    currentBlock,
    urgency,
    motiv: proj.status,
    messages: proj.messages,
    display,
    settledAmount,
    expectedAmount,
    credLo,
    credHi,
    maxAmount,
    pUnpaidNext,
    postMean,
    trend,
    fully: uploaded >= 8,
    priority: pUnpaidNext * 100 + (1 - postMean),
  };
}
