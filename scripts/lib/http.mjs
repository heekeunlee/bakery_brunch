/** 재시도 + 레이트리밋을 곁들인 얇은 fetch 래퍼. */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastCall = 0;
const MIN_GAP_MS = 120; // 네이버/카카오 모두 초당 수~수십 콜을 허용하지만 여유 있게.

export async function getJson(url, headers, { retries = 3 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const gap = Date.now() - lastCall;
    if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
    lastCall = Date.now();

    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(500 * 2 ** attempt);
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
