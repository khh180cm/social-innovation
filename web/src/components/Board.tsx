"use client";

import { useState } from "react";
import type { Row } from "@/lib/row";
import type { Trend } from "@/lib/asof";
import { URGENCY_META, Urgency } from "@/lib/ui";
import { pct } from "@/lib/format";
import { RiskTable } from "./RiskTable";
import { DetailModal } from "./DetailModal";

const TRENDS: { key: Trend; label: string; glyph: string }[] = [
  { key: "up", label: "적극 참여", glyph: "▲" },
  { key: "flat", label: "보통", glyph: "→" },
  { key: "down", label: "하락", glyph: "▼" },
];

export function Board({
  rows,
  uploaded,
  total,
  observedRate,
}: {
  rows: Row[];
  uploaded: number;
  total: number;
  observedRate: number;
}) {
  const [u, setU] = useState<Urgency | null>(null);
  const [t, setT] = useState<Trend | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const count = (uu: Urgency, tt: Trend) =>
    rows.filter((r) => r.view.urgency === uu && r.view.trend === tt).length;
  const urgent = rows.filter((r) => r.view.urgency <= 2).length;

  const filtered = rows.filter(
    (r) =>
      (u === null || r.view.urgency === u) && (t === null || r.view.trend === t)
  );
  const row = rows.find((r) => r.id === selected) ?? null;
  const toggle = (uu: Urgency, tt: Trend) =>
    u === uu && t === tt ? (setU(null), setT(null)) : (setU(uu), setT(tt));

  return (
    <>
      {/* 요약 + 12유형 매트릭스 — 하나의 구조 */}
      <div
        className="rounded-md border overflow-hidden"
        style={{ background: "var(--panel)" }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
              즉시 조치 대상
            </span>
            <span
              className="mono text-2xl font-semibold"
              style={{ color: urgent > 0 ? "var(--danger)" : "var(--ok)" }}
            >
              {urgent}
            </span>
            <span className="text-sm text-[var(--ink-faint)]">/ {total}명</span>
          </div>
          <div className="flex gap-4 text-[11px] text-[var(--ink-faint)] mono">
            <span>누적 출석 {pct(observedRate, 1)}</span>
            <span>업로드 {uploaded}/8주</span>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-[11px] text-[var(--ink-faint)]"
              style={{ background: "var(--panel-2)" }}
            >
              <th className="px-4 py-2 text-left font-medium">구간 \ 경향</th>
              {TRENDS.map((tr) => (
                <th key={tr.key} className="px-3 py-2 text-center font-medium">
                  {tr.glyph} {tr.label}
                </th>
              ))}
              <th className="px-4 py-2 text-center font-medium">계</th>
            </tr>
          </thead>
          <tbody>
            {([1, 2, 3, 4] as Urgency[]).map((uu) => {
              const meta = URGENCY_META[uu];
              const rowTotal = TRENDS.reduce((s, tr) => s + count(uu, tr.key), 0);
              const emphasize = uu === 1;
              return (
                <tr
                  key={uu}
                  className="border-t"
                  style={{
                    borderColor: "var(--line-soft)",
                    background: emphasize ? "#fdf1f1" : "transparent",
                  }}
                >
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: meta.color }}
                      />
                      <span className="font-medium" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                    </span>
                  </td>
                  {TRENDS.map((tr) => {
                    const c = count(uu, tr.key);
                    const active = u === uu && t === tr.key;
                    return (
                      <td key={tr.key} className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggle(uu, tr.key)}
                          disabled={c === 0}
                          className="inline-block min-w-[2.6rem] px-2.5 py-1 rounded-sm mono transition-colors disabled:cursor-default"
                          style={{
                            background: active
                              ? "var(--primary)"
                              : c > 0
                              ? "var(--panel-2)"
                              : "transparent",
                            color: active
                              ? "#fff"
                              : c > 0
                              ? "var(--ink)"
                              : "var(--ink-faint)",
                            border: active
                              ? "1px solid var(--primary)"
                              : "1px solid var(--line)",
                            fontWeight: active ? 700 : 500,
                          }}
                        >
                          {c}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-center mono text-[var(--ink-dim)]">
                    {rowTotal}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 명단 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          우선 확인 명단{" "}
          {(u !== null || t !== null) && (
            <span className="font-normal text-[var(--ink-faint)]">
              · 선택 유형 {filtered.length}명{" "}
              <button
                onClick={() => {
                  setU(null);
                  setT(null);
                }}
                className="text-[var(--ink-dim)] hover:text-[var(--ink)]"
              >
                ✕
              </button>
            </span>
          )}
        </h2>
        <RiskTable rows={filtered} onSelect={setSelected} />
      </section>

      {row && (
        <DetailModal
          row={row}
          uploaded={uploaded}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
