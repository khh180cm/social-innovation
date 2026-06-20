"use client";

import type { Row } from "@/lib/row";
import type { DisplayCell } from "@/lib/asof";
import { rateColor, URGENCY_META, Urgency } from "@/lib/ui";
import { pct, wonShort } from "@/lib/format";

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const m = URGENCY_META[urgency];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ background: m.bg, color: m.text }}
    >
      {m.label}
    </span>
  );
}

function TrackCells({ cells }: { cells: DisplayCell[] }) {
  return (
    <div className="flex items-center gap-1">
      {cells
        .slice()
        .sort((a, b) => a.block - b.block)
        .map((c) => (
          <span
            key={c.block}
            className="inline-flex items-baseline gap-1 rounded border px-1.5 py-0.5"
            style={{
              borderColor:
                c.state === "progress" ? "var(--primary)" : "var(--line)",
              background: "var(--panel-2)",
              opacity: c.state === "not_started" ? 0.5 : 1,
            }}
          >
            <span className="text-[9px] text-[var(--ink-faint)]">
              {c.block === 1 ? "1–4주" : "5–8주"}
            </span>
            {c.rate === null ? (
              <span className="text-[10px] text-[var(--ink-faint)]">예정</span>
            ) : (
              <span
                className="mono text-xs font-medium"
                style={{ color: rateColor(c.rate) }}
              >
                {pct(c.rate, 0)}
                {c.state !== "settled" && (
                  <span className="text-[var(--ink-faint)]">*</span>
                )}
              </span>
            )}
          </span>
        ))}
    </div>
  );
}

export function RiskTable({
  rows,
  onSelect,
}: {
  rows: Row[];
  onSelect: (id: number) => void;
}) {
  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{ background: "var(--panel)" }}
    >
      <div className="max-h-[58vh] overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr
              className="text-left text-xs text-[var(--ink-dim)] border-b"
              style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
            >
              <th className="pl-4 pr-2 py-2.5 font-medium w-10">#</th>
              <th className="px-2 py-2.5 font-medium">참여자</th>
              <th className="px-2 py-2.5 font-medium">긴급도</th>
              <th className="px-2 py-2.5 font-medium">직무훈련 출석</th>
              <th className="px-2 py-2.5 font-medium">일경험 출석</th>
              <th className="px-2 py-2.5 font-medium">예측 수당</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const fully = r.view.fully;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  className="border-b cursor-pointer hover:bg-[var(--primary-soft)]"
                  style={{ borderColor: "var(--line-soft)" }}
                >
                  <td className="pl-4 pr-2 py-2 relative">
                    <span
                      className="absolute left-0 top-0 h-full w-1"
                      style={{ background: URGENCY_META[r.view.urgency].color }}
                    />
                    <span className="mono text-[var(--ink-faint)]">{i + 1}</span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="font-medium text-[var(--ink)]">
                      {r.name}
                    </span>
                    <div className="text-[11px] text-[var(--ink-faint)]">
                      {r.programType}·{r.org} · {r.gender} · {r.birthYear}년생
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <UrgencyBadge urgency={r.view.urgency} />
                      {r.view.trend !== "flat" && (
                        <span
                          className="text-[11px]"
                          style={{
                            color:
                              r.view.trend === "down"
                                ? "var(--danger)"
                                : "var(--ok)",
                          }}
                          title={
                            r.view.trend === "down"
                              ? "출석 하락 추세"
                              : "출석 상승 추세"
                          }
                        >
                          {r.view.trend === "down" ? "▼" : "▲"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <TrackCells
                      cells={r.view.display.filter(
                        (c) => c.track === "job_training"
                      )}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <TrackCells
                      cells={r.view.display.filter(
                        (c) => c.track === "work_experience"
                      )}
                    />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {fully ? (
                      <div className="mono font-medium">
                        {wonShort(r.view.settledAmount)}
                      </div>
                    ) : (
                      <>
                        <div className="mono text-sm font-medium">
                          기대 {wonShort(r.view.expectedAmount)}
                        </div>
                        <div className="mono text-[10px] text-[var(--ink-faint)]">
                          80% {wonShort(r.view.credLo)}–{wonShort(r.view.credHi)}
                        </div>
                        {r.view.pUnpaidNext >= 0.05 && (
                          <div
                            className="mono text-[10px]"
                            style={{
                              color:
                                r.view.pUnpaidNext >= 0.5
                                  ? "var(--danger)"
                                  : "var(--warn)",
                            }}
                          >
                            미지급 {Math.round(r.view.pUnpaidNext * 100)}%
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[11px] text-[var(--ink-faint)] border-t bg-[var(--panel-2)]">
        출석 = 1–4주 / 5–8주 블록별 출석률(수당은 4주마다 정산) ·{" "}
        <span className="mono">*</span> = 미확정(예측) · 행 클릭 시 상세
      </div>
    </div>
  );
}
