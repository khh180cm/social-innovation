import type { AsOfView } from "./asof";
import type { TrackProjection } from "./projection";
import type { WeekFeedback } from "./multisource";

// 표 + 모달이 함께 쓰는 직렬화 가능한 행 데이터 (서버 → 클라이언트 전달)
export interface Row {
  id: number;
  name: string;
  programName: string;
  programType: string;
  org: string;
  gender: string;
  birthYear: number;
  view: AsOfView;
  tracks: TrackProjection[];
  weekly: WeekFeedback[];
}
