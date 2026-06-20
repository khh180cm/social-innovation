import Link from "next/link";
import { getData, getPrograms } from "@/lib/data";
import { viewAsOf, Prior } from "@/lib/asof";
import { cohortPrior } from "@/lib/bayes";
import { weeklyFeedback } from "@/lib/multisource";
import { projectParticipant } from "@/lib/projection";
import type { Row } from "@/lib/row";
import { ProgramTabs } from "@/components/ProgramTabs";
import { Board } from "@/components/Board";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { participants } = getData();
  const programs = getPrograms();
  const sp = await searchParams;

  let uploaded = Number(Array.isArray(sp.asof) ? sp.asof[0] : sp.asof ?? 3);
  if (!Number.isFinite(uploaded)) uploaded = 3;
  uploaded = Math.min(8, Math.max(1, Math.round(uploaded)));

  const rawProgram = Array.isArray(sp.program) ? sp.program[0] : sp.program;
  const selected =
    rawProgram && programs.includes(rawProgram) ? rawProgram : null;
  const pool = selected
    ? participants.filter((p) => p.programName === selected)
    : participants;

  const poolWeeks = pool.map((p) => p.weeks);
  const prior: Prior = {
    job_training: cohortPrior(poolWeeks, "job_training", uploaded),
    work_experience: cohortPrior(poolWeeks, "work_experience", uploaded),
  };

  const rows: Row[] = pool
    .map((p) => {
      const view = viewAsOf(p.id, p.weeks, uploaded, prior);
      return {
        id: p.id,
        name: p.name,
        programName: p.programName,
        programType: p.programType,
        org: p.org,
        gender: p.gender,
        birthYear: p.birthYear,
        view,
        tracks: projectParticipant(p.weeks, uploaded).tracks,
        weekly: weeklyFeedback(p.id, p.weeks, uploaded),
      };
    })
    .sort(
      (a, b) =>
        a.view.urgency - b.view.urgency || b.view.priority - a.view.priority
    );

  const obsCells = pool.flatMap((p) =>
    p.weeks.filter((w) => w.week <= uploaded)
  );
  const oa = obsCells.reduce((s, w) => s + w.jtAttended + w.weAttended, 0);
  const ot = obsCells.reduce((s, w) => s + w.jtTotal + w.weTotal, 0);
  const observedRate = ot > 0 ? oa / ot : 0;

  const href = (w: number) =>
    `/?${selected ? `program=${encodeURIComponent(selected)}&` : ""}asof=${w}`;

  return (
    <main className="mx-auto max-w-[1320px] px-6 py-7 flex flex-col gap-6">
      <header
        className="flex items-center gap-3 pb-3 border-b"
        style={{ borderColor: "var(--line)" }}
      >
        <div
          className="h-9 w-9 rounded-md grid place-items-center text-white font-bold text-xs shrink-0"
          style={{ background: "var(--primary)" }}
        >
          케어
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            참여자 케어 보드
          </h1>
          <p className="text-xs text-[var(--ink-faint)]">
            미래내일 일경험 · 운영 관리 시스템
          </p>
        </div>
      </header>

      <ProgramTabs programs={programs} selected={selected} asof={uploaded} />

      {/* 주차별 업로드 누적 컨트롤 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="kicker">
            출석 데이터 누적 · {uploaded}/8주 · 남은 {8 - uploaded}주 예측
          </span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => {
              const done = w <= uploaded;
              return (
                <span key={w} className="flex items-center">
                  {w === 5 && (
                    <span
                      className="mx-1.5 h-4 w-px"
                      style={{ background: "var(--line)" }}
                    />
                  )}
                  <Link
                    href={href(w)}
                    className="h-7 w-8 grid place-items-center rounded text-[11px] mono border transition-colors hover:border-[var(--primary)]"
                    style={{
                      color: done ? "var(--primary)" : "var(--ink-faint)",
                      background: done ? "var(--primary-soft)" : "var(--panel)",
                      borderColor: done ? "var(--primary)" : "var(--line)",
                      borderStyle: done ? "solid" : "dashed",
                    }}
                    title={done ? `${w}주차 업로드됨` : `${w}주차까지 업로드`}
                  >
                    {w}
                  </Link>
                </span>
              );
            })}
          </div>
        </div>

        {uploaded < 8 ? (
          <Link
            href={href(uploaded + 1)}
            className="primary text-sm px-4 py-2 rounded-md font-medium"
          >
            {uploaded + 1}주차 출석 업로드 →
          </Link>
        ) : (
          <span className="text-sm px-4 py-2 rounded-md border text-[var(--ink-dim)]">
            전 주차 업로드 완료 · 최종 정산
          </span>
        )}
      </div>

      <Board
        rows={rows}
        uploaded={uploaded}
        total={pool.length}
        observedRate={observedRate}
      />
    </main>
  );
}
