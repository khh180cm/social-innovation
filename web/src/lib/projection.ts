// 전망(projection) 레이어 — "지나간 출석"이 아니라 "남은 일정 기준 도달 가능 구간"으로
// 계단형(notch) 수당이 만드는 동기 사각지대를 잡는다.
//
// 기준선 = 현재 출석 추세(observedRate). 그 추세 대비:
//   🔒 포기(lost)    : 남은 일정 다 나와도 50% 불가 → 금전 동기 소멸
//   ✅ 천장(ceiling) : 더 안 나와도 이미 90%+ 확보 → 추가 출석 한계 인센티브 0
//   🎯 푸시(push)    : 조금만 더 나오면 추세보다 상위 구간 → 고ROI 넛지
//   🪜 슬랙(coasting): 더 안 나와도 추세 구간 유지(이미 확보) → 남은 일정 빠져도 동일

import {
  Track,
  tierIndex,
  amountFor,
  TIER_LOWER_BOUNDS,
  TIER_LABELS,
} from "./rules";
import type { WeekRow } from "./data";

export type MotivationStatus =
  | "lost"
  | "push"
  | "coasting"
  | "ceiling"
  | "on_track";

export const MOTIV_ORDER: MotivationStatus[] = [
  "lost",
  "push",
  "coasting",
  "ceiling",
  "on_track",
];

export const MOTIV_BOOST: Record<MotivationStatus, number> = {
  lost: 50,
  push: 30,
  coasting: 6,
  ceiling: 0,
  on_track: 0,
};

export interface TrackProjection {
  track: Track;
  status: MotivationStatus;
  message: string;
  observedRate: number;
  bestRate: number;
  worstRate: number;
}

export interface Projection {
  asOfWeek: number;
  block: 1 | 2;
  hasRemaining: boolean;
  status: MotivationStatus; // 종합 (가장 actionable)
  tracks: TrackProjection[];
  messages: string[];
  boost: number;
}

const BLOCK_WEEKS: Record<1 | 2, number[]> = {
  1: [1, 2, 3, 4],
  2: [5, 6, 7, 8],
};

function attendedOf(w: WeekRow, track: Track) {
  return track === "job_training" ? w.jtAttended : w.weAttended;
}
function totalOf(w: WeekRow, track: Track) {
  return track === "job_training" ? w.jtTotal : w.weTotal;
}

function projectTrack(
  weeks: WeekRow[],
  track: Track,
  block: 1 | 2,
  asOfWeek: number
): TrackProjection {
  const inBlock = weeks.filter((w) => BLOCK_WEEKS[block].includes(w.week));
  const observed = inBlock.filter((w) => w.week <= asOfWeek);
  const remaining = inBlock.filter((w) => w.week > asOfWeek);

  const aObs = observed.reduce((s, w) => s + attendedOf(w, track), 0);
  const tObs = observed.reduce((s, w) => s + totalOf(w, track), 0);
  const tRem = remaining.reduce((s, w) => s + totalOf(w, track), 0);
  const T = tObs + tRem;
  const remDays = remaining.length;
  const label = track === "job_training" ? "직무훈련" : "일경험";

  const observedRate = tObs > 0 ? aObs / tObs : 0; // 현재 출석 추세
  const bestRate = T > 0 ? (aObs + tRem) / T : 0; // 남은 일정 다 나오면
  const worstRate = T > 0 ? aObs / T : 0; // 더 안 나오면
  const trajTier = tierIndex(observedRate);
  const bestTier = tierIndex(bestRate);

  // 목표 구간(bound) 도달에 필요한 최소 남은 일수 (시간 큰 날부터 채움)
  const remByHours = [...remaining].sort(
    (a, b) => totalOf(b, track) - totalOf(a, track)
  );
  function daysToReach(bound: number): number | null {
    const need = bound * T - aObs;
    if (need <= 0) return 0;
    if (bestRate < bound) return null;
    let added = 0;
    let days = 0;
    for (const w of remByHours) {
      if (added >= need) break;
      added += totalOf(w, track);
      days += 1;
    }
    return added >= need ? days : null;
  }

  let status: MotivationStatus = "on_track";
  let message = "";

  if (bestTier === 4) {
    // 남은 일정 다 나와도 50% 불가 → 금전 동기 소멸
    status = "lost";
    message = remDays
      ? `${label} B${block}: 남은 ${remDays}일 다 나와도 ${Math.round(
          bestRate * 100
        )}% — 수당 도달 불가(포기 위험)`
      : `${label} B${block}: 최종 ${Math.round(worstRate * 100)}% — 미지급 확정`;
  } else if (remDays === 0) {
    // 정산 완료(블록 종료)
    if (worstRate >= 0.9) {
      status = "ceiling";
      message = `${label} B${block}: 최종 90%+ — 만점 수당 확보`;
    }
  } else if (trajTier === 0) {
    // 추세상 이미 90%+ → 추가 출석의 한계 인센티브 0 (천장 효과)
    status = "ceiling";
    message = `${label} B${block}: 추세상 90%+ — 추가 출석 한계 인센티브 0, 성과·안착 전환`;
  } else if (bestTier < trajTier) {
    // 추세보다 위 구간을 달성 가능 → 넛지 가치 (고ROI)
    const days = daysToReach(TIER_LOWER_BOUNDS[bestTier]) ?? remDays;
    const gain = amountFor(track, bestTier) - amountFor(track, trajTier);
    status = "push";
    message =
      trajTier === 4
        ? `${label} B${block}: ${days}일만 더 나오면 미지급 탈출 (${TIER_LABELS[bestTier]}, +${gain.toLocaleString(
            "ko-KR"
          )}원)`
        : `${label} B${block}: ${days}일만 더 나오면 ${TIER_LABELS[bestTier]} 구간 (+${gain.toLocaleString(
            "ko-KR"
          )}원)`;
  } else {
    // bestTier === trajTier → 구간 상한 고정. 최고구간 확보에 필요한 일수 대비 여유?
    // bestTier === trajTier (1..3) → 상위 구간 불가. 최고구간 확보 후 남는 여유일?
    const daysToBest = daysToReach(TIER_LOWER_BOUNDS[bestTier]) ?? remDays;
    const slackDays = remDays - daysToBest;
    if (slackDays >= 1) {
      status = "coasting";
      message = `${label} B${block}: 이미 ${TIER_LABELS[bestTier]} 구간 확보, 남은 ${remDays}일 중 ${slackDays}일 빠져도 동일(슬랙)`;
    }
  }

  return { track, status, message, observedRate, bestRate, worstRate };
}

export function projectParticipant(
  weeks: WeekRow[],
  asOfWeek: number
): Projection {
  const block: 1 | 2 = asOfWeek <= 4 ? 1 : 2;
  const hasRemaining = BLOCK_WEEKS[block].some((w) => w > asOfWeek);

  const tracks: TrackProjection[] = (
    ["job_training", "work_experience"] as Track[]
  ).map((t) => projectTrack(weeks, t, block, asOfWeek));

  const status = MOTIV_ORDER.find((s) => tracks.some((t) => t.status === s))!;
  const messages = tracks
    .filter((t) => t.status !== "on_track")
    .map((t) => t.message);

  return {
    asOfWeek,
    block,
    hasRemaining,
    status,
    tracks,
    messages,
    boost: MOTIV_BOOST[status],
  };
}
