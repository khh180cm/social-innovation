export type StatusKey = "critical" | "atrisk" | "watch" | "stable";

export const STATUS_META: Record<StatusKey, { label: string; order: number }> = {
  critical: { label: "긴급", order: 0 },
  atrisk: { label: "위험", order: 1 },
  watch: { label: "주의", order: 2 },
  stable: { label: "안정", order: 3 },
};

// 긴급도 — 일반 관리 시스템 배지(연한 배경 + 진한 글자)
export type Urgency = 1 | 2 | 3 | 4;

export const URGENCY_META: Record<
  Urgency,
  { label: string; color: string; bg: string; text: string }
> = {
  1: { label: "긴급", color: "var(--danger)", bg: "#fbeaea", text: "#b3261e" },
  2: { label: "위험", color: "var(--warn)", bg: "#fbefe0", text: "#9a5614" },
  3: { label: "주의", color: "var(--caution)", bg: "#faf3d8", text: "#856608" },
  4: { label: "안정", color: "var(--ok)", bg: "#e7f4ec", text: "#1d7a43" },
};

// 전망(동기)
export type MotivKey = "lost" | "push" | "coasting" | "ceiling" | "on_track";

export const MOTIV_META: Record<
  MotivKey,
  { label: string; text: string; bar: string }
> = {
  lost: { label: "포기", text: "#b3261e", bar: "var(--danger)" },
  push: { label: "끌어올림", text: "#1d4ed8", bar: "var(--primary)" },
  coasting: { label: "슬랙", text: "#9a5614", bar: "var(--warn)" },
  ceiling: { label: "천장", text: "#1d7a43", bar: "var(--ok)" },
  on_track: { label: "정상", text: "var(--ink-faint)", bar: "transparent" },
};

/** 출석률(0..1) → 표시 색 (라이트 배경, 낮을수록 강조) */
export function rateColor(rate: number): string {
  if (rate >= 0.7) return "var(--ink)";
  if (rate >= 0.6) return "#9a5614";
  if (rate >= 0.5) return "#a8521a";
  return "#b3261e";
}

export function severityColor(u: Urgency): string {
  return URGENCY_META[u].color;
}
