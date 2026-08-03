import { getJson } from './http.mjs';

const ENDPOINT = 'https://openapi.naver.com/v1/search/blog.json';

function headers() {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 필요합니다.');
  }
  return { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret };
}

/**
 * 블로그 검색. display 최대 100, start 최대 1000.
 * pages 만큼 이어서 긁어 하나의 배열로 돌려준다.
 */
export async function searchBlog(query, { pages = 3, sort = 'sim' } = {}) {
  const items = [];
  for (let page = 0; page < pages; page++) {
    const start = page * 100 + 1;
    if (start > 1000) break;
    const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&display=100&start=${start}&sort=${sort}`;
    const data = await getJson(url, headers());
    if (!data.items?.length) break;
    items.push(...data.items);
    if (data.items.length < 100) break; // 마지막 페이지
  }
  return items;
}

/** 상호 하나의 총 언급량. buzz 보조 지표 용도. */
export async function blogTotal(query) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&display=1`;
  const data = await getJson(url, headers());
  return data.total ?? 0;
}
