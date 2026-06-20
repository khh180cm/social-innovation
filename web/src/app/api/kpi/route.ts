import { NextRequest, NextResponse } from "next/server";
import { getData } from "@/lib/data";
import { viewAsOf, Prior } from "@/lib/asof";
import { cohortPrior } from "@/lib/bayes";
import { backtest } from "@/lib/backtest";
import { weeklyFeedback } from "@/lib/multisource";

export function GET(req: NextRequest) {
  const { participants } = getData();
  const asof = Math.min(
    8,
    Math.max(1, Number(req.nextUrl.searchParams.get("asof") ?? 3))
  );
  const poolWeeks = participants.map((p) => p.weeks);
  const prior: Prior = {
    job_training: cohortPrior(poolWeeks, "job_training", asof),
    work_experience: cohortPrior(poolWeeks, "work_experience", asof),
  };

  const rows = participants
    .map((p) => ({ p, v: viewAsOf(p.id, p.weeks, asof, prior) }))
    .sort((a, b) => a.v.urgency - b.v.urgency || b.v.priority - a.v.priority);

  const byUrgency: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  rows.forEach((r) => (byUrgency[r.v.urgency] += 1));
  const avgUnpaid =
    rows.reduce((s, r) => s + r.v.pUnpaidNext, 0) / rows.length;

  return NextResponse.json({
    asof,
    backtest: backtest(poolWeeks, asof),
    prior,
    byUrgency,
    avgUnpaidNext: Math.round(avgUnpaid * 100) / 100,
    sample: [rows[0]].filter(Boolean).map((r) => ({
      name: r.p.name,
      urgency: r.v.urgency,
      weekly: weeklyFeedback(r.p.id, r.p.weeks, asof).map((f) => ({
        week: f.week,
        출석: Math.round(f.rate * 100),
        교사: `${f.teacher.attitude}/${f.teacher.diligence}/${f.teacher.quiz}`,
        알림톡확인: Math.round(f.alimtalk.readRate * 100),
        구글폼: f.googleForm.submitted ? `만족${f.googleForm.satisfaction}` : "미제출",
      })),
    })),
  });
}
