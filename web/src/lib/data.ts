import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  Track,
  tierIndex,
  amountFor,
  maxAmountFor,
  TIER_LABELS,
  TIER_LOWER_BOUNDS,
} from "./rules";
import { StatusKey, STATUS_META } from "./ui";

// ── 위험 점수 가중치 (결정론·문서화된 상수) ───────────────────────────────
// 운영자가 "누구를 먼저 봐야 하는가"를 정렬하기 위한 투명한 룰.
// 실데이터 투입 시 환수율·이탈률과 상관분석으로 재보정 대상.
export const RISK_WEIGHTS = {
  unpaidCell: 40, // 미지급(<50%) 셀 1건당
  nearBoundary: 18, // 구간 경계 바로 위(떨어지면 강등) 1건당
  droppingTrack: 15, // 블록2가 블록1 대비 큰 폭 하락한 트랙 1개당
  lowAvgUnder70: 12, // 평균 출석률 < 70%
  lowAvgUnder60: 10, // 평균 출석률 < 60% (추가 가산)
  brinkCell: 8, // 50~60% (미지급 직전) 셀 1건당
} as const;

export const NEAR_BOUNDARY_MARGIN = 0.03; // 경계 +3%p 이내 = "임박"
export const DROP_THRESHOLD = 0.1; // 블록2 -10%p 이상 하락 = "하락 추세"

export interface Cell {
  block: 1 | 2;
  track: Track;
  attended: number;
  total: number;
  rate: number;
  tierIdx: number;
  tierLabel: string;
  amount: number;
  maxAmount: number;
}

export interface WeekRow {
  week: number;
  jtAttended: number;
  jtTotal: number;
  weAttended: number;
  weTotal: number;
}

export interface Participant {
  id: number;
  programName: string;
  programType: "일경험" | "직무훈련";
  org: string;
  name: string;
  gender: "남" | "여";
  birthYear: number;
  weeks: WeekRow[];
  cells: Cell[];
  jtRate: number; // 8주 전체 직무훈련 출석률
  weRate: number; // 8주 전체 일경험 출석률
  avgRate: number; // 4셀 평균
  totalAmount: number;
  maxAmount: number;
  status: StatusKey;
  priority: number;
  flags: string[];
}

export interface Kpi {
  count: number;
  avgJtRate: number;
  avgWeRate: number;
  block1AvgRate: number;
  block2AvgRate: number;
  paidTotal: number;
  maxTotal: number;
  paymentRate: number;
  unpaidCells: number;
  statusCounts: Record<StatusKey, number>;
  // 개입 시뮬레이션 (결정론 산술 상한, 인과효과 아님)
  simLiftUnpaidTo50: number; // 미지급 셀을 50~60% 구간으로
  simLiftOneTier: number; // 모든 비최고 셀을 한 단계 상향
}

const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TRACKS: Track[] = ["job_training", "work_experience"];

function col(week: number, track: Track, kind: "attended" | "total"): string {
  const w = String(week).padStart(2, "0");
  return `week_${w}_${track}_${kind}_hours`;
}

function buildCells(row: Record<string, string>): Cell[] {
  const cells: Cell[] = [];
  for (const block of [1, 2] as const) {
    const weeks = block === 1 ? WEEKS.slice(0, 4) : WEEKS.slice(4);
    for (const track of TRACKS) {
      let attended = 0;
      let total = 0;
      for (const w of weeks) {
        attended += Number(row[col(w, track, "attended")]);
        total += Number(row[col(w, track, "total")]);
      }
      const rate = total > 0 ? attended / total : 0;
      const idx = tierIndex(rate);
      cells.push({
        block,
        track,
        attended,
        total,
        rate,
        tierIdx: idx,
        tierLabel: TIER_LABELS[idx],
        amount: amountFor(track, idx),
        maxAmount: maxAmountFor(track),
      });
    }
  }
  return cells;
}

function buildWeeks(row: Record<string, string>): WeekRow[] {
  return WEEKS.map((week) => ({
    week,
    jtAttended: Number(row[col(week, "job_training", "attended")]),
    jtTotal: Number(row[col(week, "job_training", "total")]),
    weAttended: Number(row[col(week, "work_experience", "attended")]),
    weTotal: Number(row[col(week, "work_experience", "total")]),
  }));
}

function pooledRate(cells: Cell[], track: Track): number {
  const sel = cells.filter((c) => c.track === track);
  const a = sel.reduce((s, c) => s + c.attended, 0);
  const t = sel.reduce((s, c) => s + c.total, 0);
  return t > 0 ? a / t : 0;
}

function assess(cells: Cell[]): {
  status: StatusKey;
  priority: number;
  flags: string[];
} {
  const flags: string[] = [];
  const unpaid = cells.filter((c) => c.rate < 0.5);
  const brink = cells.filter((c) => c.rate >= 0.5 && c.rate < 0.6);
  const near = cells.filter((c) =>
    TIER_LOWER_BOUNDS.some(
      (b) => c.rate >= b && c.rate < b + NEAR_BOUNDARY_MARGIN
    )
  );

  // 트랙별 블록1→블록2 하락
  let droppingTracks = 0;
  for (const track of TRACKS) {
    const b1 = cells.find((c) => c.track === track && c.block === 1)!;
    const b2 = cells.find((c) => c.track === track && c.block === 2)!;
    const delta = b2.rate - b1.rate;
    if (delta <= -DROP_THRESHOLD) {
      droppingTracks += 1;
      flags.push(
        `${track === "job_training" ? "직무훈련" : "일경험"} 블록2 출석 ${Math.round(
          -delta * 100
        )}%p 하락`
      );
    }
  }

  for (const c of unpaid) {
    flags.push(
      `미지급: ${c.track === "job_training" ? "직무훈련" : "일경험"} 블록${c.block} 출석 ${(
        c.rate * 100
      ).toFixed(0)}% (<50%)`
    );
  }
  for (const c of brink) {
    flags.push(
      `미지급 직전: ${c.track === "job_training" ? "직무훈련" : "일경험"} 블록${c.block} ${(
        c.rate * 100
      ).toFixed(0)}%`
    );
  }
  for (const c of near.filter((c) => c.rate >= 0.6)) {
    flags.push(
      `경계 임박: ${c.track === "job_training" ? "직무훈련" : "일경험"} 블록${c.block} ${(
        c.rate * 100
      ).toFixed(0)}% (강등 위험)`
    );
  }

  const avg = cells.reduce((s, c) => s + c.rate, 0) / cells.length;
  let priority =
    unpaid.length * RISK_WEIGHTS.unpaidCell +
    near.length * RISK_WEIGHTS.nearBoundary +
    droppingTracks * RISK_WEIGHTS.droppingTrack +
    brink.length * RISK_WEIGHTS.brinkCell;
  if (avg < 0.7) priority += RISK_WEIGHTS.lowAvgUnder70;
  if (avg < 0.6) priority += RISK_WEIGHTS.lowAvgUnder60;

  let status: StatusKey;
  if (unpaid.length > 0) status = "critical";
  else if (droppingTracks > 0 || brink.length > 0) status = "atrisk";
  else if (near.length > 0 || avg < 0.8) status = "watch";
  else status = "stable";

  return { status, priority, flags };
}

let cache: { participants: Participant[]; kpi: Kpi } | null = null;

export function getData(): { participants: Participant[]; kpi: Kpi } {
  if (cache) return cache;

  const csvPath = path.join(process.cwd(), "data", "participants.csv");
  const raw = fs.readFileSync(csvPath, "utf-8").trim();
  const lines = raw.split(/\r?\n/);
  const header = lines[0].split(",");

  const participants: Participant[] = lines.slice(1).map((line, i) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    header.forEach((h, idx) => (row[h] = values[idx]));

    const programName = row["program_name"];
    const programType: "일경험" | "직무훈련" = programName.startsWith("직무훈련")
      ? "직무훈련"
      : "일경험";
    const org = programName.slice(-1);
    const code = row["dummy_birth_gender_code"] ?? "";
    const genderDigit = code.split("-")[1]?.[0] ?? "3";
    const gender: "남" | "여" = genderDigit === "4" ? "여" : "남";
    const birthYear = 2000 + Number(code.slice(0, 2) || "0");

    const cells = buildCells(row);
    const { status, priority, flags } = assess(cells);
    const totalAmount = cells.reduce((s, c) => s + c.amount, 0);
    const maxAmount = cells.reduce((s, c) => s + c.maxAmount, 0);

    return {
      id: i,
      programName,
      programType,
      org,
      name: row["participant_name"],
      gender,
      birthYear,
      weeks: buildWeeks(row),
      cells,
      jtRate: pooledRate(cells, "job_training"),
      weRate: pooledRate(cells, "work_experience"),
      avgRate: cells.reduce((s, c) => s + c.rate, 0) / cells.length,
      totalAmount,
      maxAmount,
      status,
      priority,
      flags,
    };
  });

  participants.sort(
    (a, b) =>
      b.priority - a.priority ||
      STATUS_META[a.status].order - STATUS_META[b.status].order
  );

  cache = { participants, kpi: buildKpi(participants) };
  return cache;
}

export function getPrograms(): string[] {
  const names = [...new Set(getData().participants.map((p) => p.programName))];
  return names.sort((a, b) => {
    const ta = a.startsWith("직무훈련") ? 1 : 0;
    const tb = b.startsWith("직무훈련") ? 1 : 0;
    return ta - tb || a.localeCompare(b, "ko");
  });
}

export function getParticipant(id: number): Participant | undefined {
  return getData().participants.find((p) => p.id === id);
}

function buildKpi(ps: Participant[]): Kpi {
  const allCells = ps.flatMap((p) => p.cells);
  const jt = allCells.filter((c) => c.track === "job_training");
  const we = allCells.filter((c) => c.track === "work_experience");
  const rate = (cs: Cell[]) =>
    cs.reduce((s, c) => s + c.attended, 0) /
    cs.reduce((s, c) => s + c.total, 0);

  const b1 = allCells.filter((c) => c.block === 1);
  const b2 = allCells.filter((c) => c.block === 2);

  const paidTotal = ps.reduce((s, p) => s + p.totalAmount, 0);
  const maxTotal = ps.reduce((s, p) => s + p.maxAmount, 0);

  const statusCounts: Record<StatusKey, number> = {
    critical: 0,
    atrisk: 0,
    watch: 0,
    stable: 0,
  };
  ps.forEach((p) => (statusCounts[p.status] += 1));

  // 시뮬레이션: 미지급 셀을 50~60% 구간(tierIdx 3)으로 끌어올릴 때 추가 지급액
  let simUnpaid = 0;
  let simOneTier = 0;
  for (const c of allCells) {
    if (c.rate < 0.5) {
      simUnpaid += amountFor(c.track, 3) - c.amount;
    }
    if (c.tierIdx > 0) {
      simOneTier += amountFor(c.track, c.tierIdx - 1) - c.amount;
    }
  }

  return {
    count: ps.length,
    avgJtRate: rate(jt),
    avgWeRate: rate(we),
    block1AvgRate: rate(b1),
    block2AvgRate: rate(b2),
    paidTotal,
    maxTotal,
    paymentRate: paidTotal / maxTotal,
    unpaidCells: allCells.filter((c) => c.rate < 0.5).length,
    statusCounts,
    simLiftUnpaidTo50: simUnpaid,
    simLiftOneTier: simOneTier,
  };
}
