import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Track } from "./rules";

// CSV 1행 = 참여자 1명. 출석은 주차×트랙별 (출석시간, 총시간)으로 들어온다.
// 위험도·예측·우선순위는 모두 asof.ts(예측 엔진)가 단일 책임으로 산출한다 —
// 이 모듈은 "원본 데이터 로드/파싱"만 담당한다(SRP).

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
}

const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function col(week: number, track: Track, kind: "attended" | "total"): string {
  const w = String(week).padStart(2, "0");
  return `week_${w}_${track}_${kind}_hours`;
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

let cache: { participants: Participant[] } | null = null;

export function getData(): { participants: Participant[] } {
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

    return {
      id: i,
      programName,
      programType,
      org,
      name: row["participant_name"],
      gender,
      birthYear,
      weeks: buildWeeks(row),
    };
  });

  participants.sort((a, b) => a.id - b.id);

  cache = { participants };
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
