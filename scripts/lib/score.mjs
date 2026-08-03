const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** 언급 포스트 수 → 0~1. 로그 스케일 + 상한으로 상위 편중을 눌러준다. */
export function mentionScore(mentions, cap = 25) {
  return clamp01(Math.log10(1 + mentions) / Math.log10(1 + cap));
}

/**
 * 블로그 총 검색량 → 0~1.
 * 316건(10^2.5) 이하는 0, 10만건(10^5) 이상은 1로 클리핑한다.
 * 클리핑이 없으면 테라로사 같은 전국 체인이 자릿수로 다른 곳을 뭉갠다.
 */
export function buzzScore(total) {
  if (!total || total <= 0) return 0;
  return clamp01((Math.log10(total) - 2.5) / 2.5);
}

/**
 * 최종 0~100 점수.
 * 주 지표는 언급 빈도, 보조가 총 검색량 — 검증 단계에서 확인한 우선순위 그대로다.
 * mine(내 평가)은 기기에만 있으므로 파이프라인에서는 항상 null 이고,
 * 클라이언트가 값을 채우면 가중치가 재분배된다.
 */
export function totalScore({ mention, buzz, mine = null }) {
  const w = mine == null ? { m: 0.75, b: 0.25, u: 0 } : { m: 0.55, b: 0.15, u: 0.3 };
  const raw = w.m * mention + w.b * buzz + w.u * (mine ?? 0);
  return Math.round(raw * 1000) / 10;
}
