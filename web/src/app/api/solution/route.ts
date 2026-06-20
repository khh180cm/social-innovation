import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getData } from "@/lib/data";
import { viewAsOf, Prior } from "@/lib/asof";
import { cohortPrior } from "@/lib/bayes";
import { weeklyFeedback } from "@/lib/multisource";
import { URGENCY_META, MOTIV_META } from "@/lib/ui";

export const runtime = "nodejs";

const SYSTEM = `너는 미래내일 일경험 사업(미취업청년 직무훈련+일경험) 운영자를 돕는 'AI 케어 코파일럿'이다.
한 참여자의 데이터를 보고, 운영자가 바로 실행할 수 있는 맞춤 조치를 제안한다.

[검증된 근거 원칙]
1) 조치는 동기부여 문구가 아니라 '구조적 장벽 해소'(교통비·생계비 지원, 잡 정보, 기대 교정)를 우선한다 (J-PAL Policy Insight).
2) 유형별로 차등한다 — 같은 개입도 세그먼트별로 정반대 효과가 날 수 있다 (J-PAL India RCT: 저학력↓ vs 고학력↑).
3) 타이밍: 초기엔 광범위·저비용 넛지(리마인더), 후기엔 표적·고비용 1:1 (OECD Lyche 2010).
4) 포기 위험(남은 일정 다 나와도 수당 불가) = 금전 독려는 무의미 → 비금전 동기·완주 목표 재설정·성과우수자 수당 레버.
5) 천장(이미 90%+ 확보) = 출석 독려 대신 성과·안착·질로 전환.
6) 푸시(조금만 더 나오면 상위 구간) = 구체적 넛지("X일만 더 나오면 +OO원").

[규칙]
- 반드시 human-in-the-loop: 너는 '제안'만 한다. 실행·승인은 운영자가 한다.
- 과장·인과 단정 금지 (더미·소표본 데이터). "효과가 있다"가 아니라 "할 수 있다/권한다".
- 출력은 한국어. 조치(actions)는 2~3개, 우선순위를 분명히 차등.
- 먼저 '직전 주 조치의 효과'를 평가하고(effectReview), 효과가 없었으면 다른 접근을 제안한다.
- 메시지 초안(message)은 운영자가 참여자에게 보낼, 따뜻하고 구체적인 1~3문장.
- 반드시 provide_solution 도구로만 응답한다.`;

const TOOL: Anthropic.Tool = {
  name: "provide_solution",
  description: "참여자 맞춤 조치 솔루션을 구조화해 제출한다.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["diagnosis", "effectReview", "actions", "message"],
    properties: {
      diagnosis: { type: "string", description: "진단 1~2줄" },
      effectReview: {
        type: "string",
        description: "직전 주 조치가 효과 있었는지 평가(개선/무효/악화 + 근거)",
      },
      actions: {
        type: "array",
        description: "차등 조치 2~3개",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "rationale", "priority", "channel"],
          properties: {
            title: { type: "string" },
            rationale: { type: "string", description: "근거(원칙·연구)" },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            channel: { type: "string", description: "알림톡 / 1:1 상담 / 수당 안내 등" },
          },
        },
      },
      message: { type: "string", description: "참여자에게 보낼 메시지 초안" },
    },
  },
};

function weekRate(att: number, tot: number) {
  return tot > 0 ? att / tot : 0;
}

export async function POST(req: NextRequest) {
  let body: { id?: number; uploaded?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const uploaded = Math.min(8, Math.max(1, Number(body.uploaded ?? 3)));
  const { participants } = getData();
  const p = participants.find((x) => x.id === Number(body.id));
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 미설정" },
      { status: 500 }
    );
  }

  const allWeeks = participants
    .filter((x) => x.programName === p.programName)
    .map((x) => x.weeks);
  const prior: Prior = {
    job_training: cohortPrior(allWeeks, "job_training", uploaded),
    work_experience: cohortPrior(allWeeks, "work_experience", uploaded),
  };
  const view = viewAsOf(p.id, p.weeks, uploaded, prior);
  const weekly = weeklyFeedback(p.id, p.weeks, uploaded);

  // 직전 주 조치 효과 프록시: 최근 주 vs 직전 주 출석 변화
  const obs = p.weeks.filter((w) => w.week <= uploaded);
  const last = obs[obs.length - 1];
  const prev = obs[obs.length - 2];
  const attDelta =
    last && prev
      ? weekRate(last.jtAttended + last.weAttended, last.jtTotal + last.weTotal) -
        weekRate(prev.jtAttended + prev.weAttended, prev.jtTotal + prev.weTotal)
      : null;
  const lastFb = weekly[weekly.length - 1];
  const prevFb = weekly[weekly.length - 2];

  const urgency = URGENCY_META[view.urgency].label;
  const trend =
    view.trend === "up" ? "적극(상승)" : view.trend === "down" ? "하락" : "보통";
  const motiv = MOTIV_META[view.motiv].label;

  const weeklyText = weekly
    .map(
      (f) =>
        `  ${f.week}주: 출석 ${Math.round(f.rate * 100)}% · 교사 태도${f.teacher.attitude}/성실${f.teacher.diligence}/쪽지${f.teacher.quiz} · 외부 ${f.external.score}/5 · 알림톡확인 ${Math.round(f.alimtalk.readRate * 100)}% · 구글폼 ${f.googleForm.submitted ? `만족${f.googleForm.satisfaction}(${f.googleForm.note})` : "미제출"} · 교사코멘트: ${f.teacher.note}`
    )
    .join("\n");

  const USER = `[참여자]
- 이름: ${p.name} (${p.programType}·${p.org}, ${p.gender}, ${p.birthYear}년생)
- 현재 ${uploaded}주차까지 업로드, 유형 = 긴급도 '${urgency}' × 경향 '${trend}', 동기 플래그 '${motiv}'
- 출석 추정(누적 propensity): ${Math.round(view.postMean * 100)}%
- 다음 정산 미지급 확률: ${Math.round(view.pUnpaidNext * 100)}%
- 예측 수당: 기대 ${Math.round(view.expectedAmount).toLocaleString("ko-KR")}원 (80% 신용 ${Math.round(view.credLo).toLocaleString("ko-KR")}~${Math.round(view.credHi).toLocaleString("ko-KR")}원)

[직전 주 조치 효과 프록시]
- 최근 주(${last?.week ?? "-"}주) 출석이 직전 주(${prev?.week ?? "-"}주) 대비 ${attDelta === null ? "비교불가(첫 주)" : `${attDelta >= 0 ? "+" : ""}${Math.round(attDelta * 100)}%p`}
- 알림톡 확인율 변화: ${prevFb && lastFb ? `${Math.round(prevFb.alimtalk.readRate * 100)}% → ${Math.round(lastFb.alimtalk.readRate * 100)}%` : "비교불가"}

[주차별 피드백]
${weeklyText}

위 데이터로: (1) 직전 주 조치가 효과 있었는지 먼저 평가하고(effectReview), (2) 그 평가를 반영해 이번 주 맞춤 조치(actions)와 운영자가 보낼 메시지 초안(message)을 제안하라. 효과가 없었으면 다른 접근을 제시하라.`;

  try {
    const anthropic = new Anthropic();
    const resp = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "provide_solution" },
      messages: [{ role: "user", content: USER }],
    });
    const block = resp.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return NextResponse.json({ error: "no solution" }, { status: 502 });
    }
    return NextResponse.json(block.input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI 호출 실패";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
