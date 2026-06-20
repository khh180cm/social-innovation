// 운영 판단 규정 — 참여자 수당 지급 기준 (출처: AX Arena 과제 슬라이드 "운영 판단 규정")
// 수당은 4주마다 지급. 출석률 = (4주 attended 합) / (4주 total 합), 직무훈련/일경험 별도 산정.
// 경계 처리: 좌폐(left-closed). ≥90 / [70,90) / [60,70) / [50,60) / <50.

export type Track = "job_training" | "work_experience";

export const TRACK_LABEL: Record<Track, string> = {
  job_training: "직무훈련",
  work_experience: "일경험",
};

// 출석률 구간별 지급액 (tierIndex 0..4)
export const JT_AMOUNTS = [150_000, 131_250, 112_500, 93_750, 0];
export const WE_AMOUNTS = [300_000, 262_500, 225_000, 187_500, 0];

export const JT_MAX = JT_AMOUNTS[0]; // 150,000
export const WE_MAX = WE_AMOUNTS[0]; // 300,000

export const TIER_LABELS = ["90% 이상", "70~90%", "60~70%", "50~60%", "50% 미만"];

// 각 구간의 하한(좌폐). tierIndex 0..3 에 대응, 4(미지급)는 하한 없음.
export const TIER_LOWER_BOUNDS = [0.9, 0.7, 0.6, 0.5];

/** 출석률(0..1) → 구간 인덱스(0=최고, 4=미지급) */
export function tierIndex(rate: number): number {
  if (rate >= 0.9) return 0;
  if (rate >= 0.7) return 1;
  if (rate >= 0.6) return 2;
  if (rate >= 0.5) return 3;
  return 4;
}

export function amountFor(track: Track, idx: number): number {
  return (track === "job_training" ? JT_AMOUNTS : WE_AMOUNTS)[idx];
}

export function maxAmountFor(track: Track): number {
  return track === "job_training" ? JT_MAX : WE_MAX;
}
