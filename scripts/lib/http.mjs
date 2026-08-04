/** 재시도 + 레이트리밋을 곁들인 얇은 fetch 래퍼. */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastCall = 0;
const MIN_GAP_MS = 120; // 네이버/카카오 모두 초당 수~수십 콜을 허용하지만 여유 있게.

/**
 * 네트워크가 몇 분씩 끊겨도 버티도록 넉넉하게 재시도한다.
 * 전국 수집은 몇 시간짜리 무인 작업이라, 짧은 재시도로는 일시적인 단절 하나에
 * 지역이 통째로 빈손이 된다. 실제로 이동 중 Wi-Fi가 바뀌면서 80개 지역 중
 * 62개가 조용히 실패한 적이 있다.
 */
export async function getJson(url, headers, { retries = 6 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const gap = Date.now() - lastCall;
    if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
    lastCall = Date.now();

    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      // fetch 자체가 던지는 경우 = DNS 실패나 연결 끊김. 회선이 돌아올 때까지
      // 기다려야 하므로 최대 60초까지 물러선다.
      if (attempt === retries) throw err;
      await sleep(Math.min(60_000, 1000 * 2 ** attempt));
      continue;
    }

    if (res.ok) return res.json();

    // 429/5xx 는 백오프 후 재시도, 그 외는 즉시 실패시켜 원인을 드러낸다.
    if (res.status === 429 || res.status >= 500) {
      if (attempt === retries) {
        throw new Error(`HTTP ${res.status} (재시도 소진): ${url}`);
      }
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${url}\n${body.slice(0, 300)}`);
  }
}
