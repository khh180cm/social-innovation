"use client";

import { useEffect, useState } from "react";
import type { Row } from "@/lib/row";
import type { Solution } from "@/lib/solutionTypes";
import { URGENCY_META, MOTIV_META } from "@/lib/ui";
import { pct } from "@/lib/format";

export function DetailModal({
  row,
  uploaded,
  onClose,
}: {
  row: Row;
  uploaded: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const urg = URGENCY_META[row.view.urgency];
  const motiv = MOTIV_META[row.view.motiv];

  const [solution, setSolution] = useState<Solution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/solution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, uploaded }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      setSolution(data as Solution);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-8 overflow-auto"
      style={{ background: "rgba(15,23,42,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] rounded-md border my-2 shadow-xl"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-start justify-between gap-3 px-5 py-4 border-b"
          style={{ borderColor: "var(--line)" }}
        >
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold tracking-tight">{row.name}</h2>
              <span
                className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                style={{ background: urg.bg, color: urg.text }}
              >
                {urg.label}
              </span>
              {row.view.motiv !== "on_track" && (
                <span
                  className="text-xs font-medium"
                  style={{ color: motiv.text }}
                >
                  {motiv.label}
                </span>
              )}
            </div>
            <p className="kicker mt-1.5">
              {row.programType}·{row.org} · {row.gender} · {row.birthYear}년생 ·{" "}
              {uploaded}주차까지 업로드
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--ink-dim)] hover:text-[var(--ink)] text-lg leading-none"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 주차별 피드백 */}
        <div className="px-5 py-4 flex flex-col gap-2.5">
          <div className="kicker">
            주차별 피드백 · 완료된 {row.weekly.length}주
          </div>

          {row.weekly.length === 0 ? (
            <div className="text-xs text-[var(--ink-faint)] py-4">
              아직 완료된 주차가 없습니다.
            </div>
          ) : (
            row.weekly
              .slice()
              .reverse()
              .map((f) => (
                <div
                  key={f.week}
                  className="rounded-md border px-4 py-3 flex flex-col gap-2"
                  style={{ background: "var(--panel)", borderColor: "var(--line)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{f.week}주차</span>
                    <span className="mono text-xs text-[var(--ink-dim)]">
                      출석 {pct(f.rate, 0)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px]">
                    <Metric
                      label="교사 태도/성실"
                      value={`${f.teacher.attitude}·${f.teacher.diligence} / 5`}
                    />
                    <Metric label="쪽지시험" value={`${f.teacher.quiz}점`} />
                    <Metric label="외부기관" value={`${f.external.score} / 5`} />
                    <Metric
                      label="알림톡 확인/응답"
                      value={`${pct(f.alimtalk.readRate, 0)} / ${pct(
                        f.alimtalk.responseRate,
                        0
                      )}`}
                    />
                  </div>

                  <div
                    className="flex flex-col gap-1 pt-1 border-t"
                    style={{ borderColor: "var(--line-soft)" }}
                  >
                    <Note label="교사 코멘트" text={f.teacher.note} />
                    <Note
                      label="구글폼"
                      text={
                        f.googleForm.submitted
                          ? `(만족 ${f.googleForm.satisfaction}/5) ${f.googleForm.note}`
                          : "미제출"
                      }
                      dim={!f.googleForm.submitted}
                    />
                  </div>
                </div>
              ))
          )}

          {/* AI 맞춤 솔루션 (3단계) */}
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="kicker">AI 맞춤 솔루션</span>
              {!solution && (
                <button
                  onClick={generate}
                  disabled={loading}
                  className="primary text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-60"
                >
                  {loading ? "생성 중…" : "생성"}
                </button>
              )}
            </div>

            {error && (
              <div className="text-xs" style={{ color: "var(--danger)" }}>
                오류: {error}
              </div>
            )}

            {solution && (
              <div
                className="rounded-md border p-4 flex flex-col gap-3"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                <div>
                  <div className="kicker mb-1">진단</div>
                  <div className="text-sm">{solution.diagnosis}</div>
                </div>
                <div>
                  <div className="kicker mb-1">직전 주 조치 효과 평가</div>
                  <div className="text-sm text-[var(--ink-dim)]">
                    {solution.effectReview}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="kicker">추천 조치</div>
                  {solution.actions.map((a, i) => (
                    <div
                      key={i}
                      className="rounded-md border p-3 flex flex-col gap-1"
                      style={{ borderColor: "var(--line-soft)" }}
                    >
                      <div className="flex items-center gap-2">
                        <PriorityTag p={a.priority} />
                        <span className="text-sm font-medium">{a.title}</span>
                        <span className="ml-auto text-[11px] text-[var(--ink-faint)]">
                          {a.channel}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-dim)]">
                        근거 · {a.rationale}
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="kicker mb-1">운영자 메시지 초안</div>
                  <div
                    className="text-sm rounded-md border p-3"
                    style={{
                      background: "var(--panel-2)",
                      borderColor: "var(--line-soft)",
                    }}
                  >
                    {solution.message}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={generate}
                    disabled={loading}
                    className="text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]"
                  >
                    {loading ? "재생성 중…" : "재생성"}
                  </button>
                  <span className="text-[10px] text-[var(--ink-faint)]">
                    AI 제안 · 실행/승인은 운영자 (human-in-the-loop)
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[var(--ink-faint)]">{label}</span>
      <span className="mono text-[var(--ink)]">{value}</span>
    </div>
  );
}

function Note({
  label,
  text,
  dim,
}: {
  label: string;
  text: string;
  dim?: boolean;
}) {
  return (
    <div className="text-[11px] leading-snug">
      <span className="text-[var(--ink-faint)]">{label} · </span>
      <span style={{ color: dim ? "var(--ink-faint)" : "var(--ink-dim)" }}>
        {text}
      </span>
    </div>
  );
}

function PriorityTag({ p }: { p: "high" | "medium" | "low" }) {
  const meta = {
    high: { label: "높음", color: "var(--danger)" },
    medium: { label: "중간", color: "var(--warn)" },
    low: { label: "낮음", color: "var(--ink-faint)" },
  }[p];
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap"
      style={{ color: meta.color, borderColor: meta.color }}
    >
      {meta.label}
    </span>
  );
}
