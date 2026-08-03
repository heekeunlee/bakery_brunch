import { getJson } from './http.mjs';

const ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';

/** 카페/베이커리 계열만 통과시키는 필터. 검증 단계의 핵심. */
const CAFE_CATEGORY = /카페|베이커리|제과|디저트|브런치|커피/;

function headers() {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) throw new Error('KAKAO_REST_KEY 환경변수가 필요합니다.');
  return { Authorization: `KakaoAK ${key}` };
}

export async function searchKeyword(query, { size = 15 } = {}) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&size=${size}`;
  const data = await getJson(url, headers());
  return data.documents ?? [];
}

const norm = (s) => s.replace(/[\s·・.,'"()\-–—]/g, '').toLowerCase();

/**
 * 블로그에서 뽑은 상호 후보를 카카오에 던져 실존 여부를 검증한다.
 * 통과 조건 3가지를 모두 만족해야 채택:
 *   1) 카페/베이커리 카테고리
 *   2) 상호명이 후보와 실질적으로 일치
 *   3) 주소가 해당 시군구
 * 셋 중 하나라도 어긋나면 null — "내돈내산" 같은 노이즈는 여기서 전부 걸러진다.
 */
export async function verifyPlace(candidate, region) {
  const docs = await searchKeyword(`${region.sigungu} ${candidate}`);
  const nc = norm(candidate);

  for (const d of docs) {
    if (!CAFE_CATEGORY.test(d.category_name)) continue;

    const np = norm(d.place_name);
    // 지점명이 붙는 경우(예: "테라로사 강릉본점")를 고려해 양방향 포함을 허용하되,
    // 후보가 너무 짧으면 오매칭이 급증하므로 완전일치만 인정한다.
    const nameOk = nc.length >= 3 ? np.includes(nc) || nc.includes(np) : np === nc;
    if (!nameOk) continue;

    const addr = d.road_address_name || d.address_name || '';
    if (!addr.includes(region.sigungu.replace(/시$|군$|구$/, ''))) continue;

    return {
      id: d.id,
      name: d.place_name,
      lat: Number(d.y),
      lng: Number(d.x),
      address: addr,
      phone: d.phone || undefined,
      categoryName: d.category_name,
      placeUrl: d.place_url,
    };
  }
  return null;
}

/** 카카오 카테고리 문자열 → 앱 내부 카테고리. */
export function toCategories(categoryName, contextText = '') {
  const out = new Set();
  if (/베이커리|제과|빵/.test(categoryName + contextText)) out.add('bakery');
  if (/브런치/.test(contextText)) out.add('brunch');
  if (/디저트|케이크|도넛/.test(categoryName + contextText)) out.add('dessert');
  if (/카페|커피/.test(categoryName)) out.add('cafe');
  if (out.size === 0) out.add('cafe');
  return [...out];
}
