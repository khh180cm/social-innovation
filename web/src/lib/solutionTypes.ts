// 3단계 AI 맞춤 솔루션 — 클라이언트/서버 공유 타입

export interface SolutionAction {
  title: string;
  rationale: string; // 근거(연구·원칙)
  priority: "high" | "medium" | "low";
  channel: string; // 알림톡 / 1:1 상담 / 수당 안내 등
}

export interface Solution {
  diagnosis: string; // 진단 1~2줄
  effectReview: string; // 직전 주 조치 효과 평가
  actions: SolutionAction[];
  message: string; // 운영자가 참여자에게 보낼 메시지 초안
}
