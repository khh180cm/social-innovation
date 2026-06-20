// 3단계용 멀티소스 더미데이터 — 주차별 피드백. 각 주 출석률과 상관되게 결정론적 생성.
// 업로드된(완료된) 주까지만 피드백 존재 → "2주차 진행중이면 1주차 피드백만".
// 결정론적(시드=id,week) → SSR 안정 + 재현 가능.

import type { WeekRow } from "./data";

export interface WeekFeedback {
  week: number;
  rate: number; // 그 주 출석률
  teacher: {
    attitude: number; // 수업태도 1~5
    diligence: number; // 성실성 1~5
    quiz: number; // 쪽지시험 0~100
    note: string;
  };
  external: { score: number }; // 외부 교육기관 1~5
  alimtalk: { sent: number; readRate: number; responseRate: number };
  googleForm: {
    submitted: boolean;
    satisfaction: number | null;
    note: string | null; // 정성 응답
  };
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));

const TEACHER_NOTES: Record<string, string[]> = {
  high: [
    "수업 태도 우수, 과제 성실 제출. 적극적으로 질문·발표.",
    "집중도 높고 협업이 좋음. 모범적.",
  ],
  mid: [
    "전반적으로 무난. 가끔 지각하나 과제는 대체로 제출.",
    "참여 보통. 동기 부여 시 더 적극적일 여지.",
  ],
  low: [
    "결석·지각 잦고 과제 미제출. 수업 중 집중도 낮음. 면담 권장.",
    "참여 소극적, 연락 응답 느림. 이탈 징후 관찰됨.",
  ],
};
const FORM_NOTES: Record<string, string[]> = {
  high: [
    "프로그램 만족도 높음. 실습 기회를 더 원함.",
    "강사·동료와 협업이 즐겁다는 응답.",
  ],
  mid: [
    "전반적으로 만족하나 일정이 빠듯하다는 의견.",
    "내용은 좋으나 과제량 부담 언급.",
  ],
  low: [
    "교통·시간 부담으로 참여가 어렵다는 응답. 지원 요청.",
    "동기 저하·진로 고민 토로. 상담 희망.",
  ],
};

export function weeklyFeedback(
  id: number,
  weeks: WeekRow[],
  uploaded: number
): WeekFeedback[] {
  const out: WeekFeedback[] = [];
  for (let w = 1; w <= uploaded; w++) {
    const row = weeks.find((x) => x.week === w);
    if (!row) continue;
    const tot = row.jtTotal + row.weTotal;
    const rate = tot > 0 ? (row.jtAttended + row.weAttended) / tot : 0;

    const rnd = mulberry32((id * 131 + w * 977 + 7) % 2147483647);
    const noise = () => (rnd() - 0.5) * 0.24;
    const base = clamp(rate, 0, 1);
    const lvl = base >= 0.85 ? "high" : base >= 0.6 ? "mid" : "low";
    const s5 = (b: number) => clamp(Math.round(1 + (b + noise()) * 4), 1, 5);
    const readRate = clamp(base * 0.85 + 0.12 + noise(), 0.05, 1);
    const submitted = base + noise() > 0.5;

    out.push({
      week: w,
      rate: base,
      teacher: {
        attitude: s5(base),
        diligence: s5(base),
        quiz: clamp(Math.round(45 + (base + noise()) * 52), 0, 100),
        note: TEACHER_NOTES[lvl][Math.floor(rnd() * TEACHER_NOTES[lvl].length)],
      },
      external: { score: s5(base) },
      alimtalk: {
        sent: 2,
        readRate,
        responseRate: clamp(readRate * (0.45 + rnd() * 0.4), 0, 1),
      },
      googleForm: {
        submitted,
        satisfaction: submitted ? s5(base) : null,
        note: submitted
          ? FORM_NOTES[lvl][Math.floor(rnd() * FORM_NOTES[lvl].length)]
          : null,
      },
    });
  }
  return out;
}
