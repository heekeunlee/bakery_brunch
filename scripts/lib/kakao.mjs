import { getJson } from './http.mjs';

const ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';

/**
 * 카페/베이커리 계열만 통과시키는 필터. 검증 단계의 핵심.
 * '음식점' 하위인지를 먼저 본다 — 이게 없으면 "여행 > 관광,명소 > 테마거리 > 카페거리"
 * 같은 지명이 '카페'라는 글자에 걸려 통과해버린다.
 */
const CAFE_CATEGORY = /^음식점\s*>/;
const CAFE_KIND = /카페|베이커리|제과|디저트|커피/;

/**
 * 전국 프랜차이즈. 블로그 언급량이 압도적이라 걸러내지 않으면 상위를 독식한다.
 * "평판 좋은 곳을 발견한다"는 목적에 체인점은 어차피 도움이 안 된다.
 * 테라로사·커피리브레처럼 지역 로스터리로 평가받는 브랜드는 일부러 남겼다.
 */
const CHAIN = new RegExp(
  [
    // 메가커피는 간판 표기가 '메가MGC커피'라 'MGC'로 잡아야 빠져나가지 않는다.
    '스타벅스', '투썸플레이스', '이디야', '메가커피', '메가엠지씨', 'MGC', '컴포즈커피',
    '디저트39', '설빙', '스무디킹', '카페아모르', '커피명가',
    '빽다방', '매머드', '파리바게[뜨트]', '뚜레쥬르', '커피빈', '할리스', '폴바셋',
    '엔젤리너스', '탐앤탐스', '카페베네', '더벤티', '감성커피', '커피에반하다',
    '배스킨라빈스', '던킨', '공차', '셀렉토', '드롭탑', '요거프레소', '바나프레소',
    '만나커피', '커피나무', '토프레소', '커피스미스', '블루보틀',
  ].join('|'),
);

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
 * 시도 약칭 → 카카오 주소 표기.
 * 카카오는 광역시를 "대전", 도를 "강원특별자치도"처럼 섞어 쓰므로 둘 다 허용한다.
 *
 * 행정구역 개편을 반영해야 한다. 광주광역시는 전남과 통합되어 카카오가
 * "전남광주통합특별시 북구"로 돌려주는데, /^광주/ 만 보고 있으면 광주 지역이
 * 통째로 검증에 실패해 한 곳도 수집되지 않는다(실제로 그랬다).
 */
const SIDO_PATTERN = {
  서울: /^서울/, 부산: /^부산/, 대구: /^대구/, 인천: /^인천/,
  광주: /^(광주|전남광주통합특별시)/,
  대전: /^대전/, 울산: /^울산/, 세종: /^세종/, 경기: /^경기/, 강원: /^강원/,
  충북: /^(충북|충청북도)/, 충남: /^(충남|충청남도)/,
  전북: /^(전북|전라북도)/, 전남: /^(전남광주통합특별시|전남|전라남도)/,
  경북: /^(경북|경상북도)/, 경남: /^(경남|경상남도)/, 제주: /^제주/,
};

/**
 * 주소가 정말 그 시군구인지 검사한다.
 *
 * 시군구만 보면 안 된다 — 중구·서구·남구·북구·동구는 여러 시도에 같은 이름으로
 * 존재해서, "서울 중구"를 찾는데 대전 중구의 성심당이 통과해버린다.
 * 시도와 시군구를 함께, 그리고 시군구는 접미사까지 온전히 일치시킨다.
 *
 * addrAliases 는 같은 지역의 다른 주소 표기다. 세종시가 주소에서는
 * "세종특별자치시"로 나오는 것처럼, 이름이 하나로 고정되지 않는 곳들을 받아준다.
 */
function addressMatchesRegion(address, region) {
  const sido = SIDO_PATTERN[region.sido];
  if (sido && !sido.test(address)) return false;
  if (address.includes(region.sigungu)) return true;
  return (region.addrAliases ?? []).some((a) => address.includes(a));
}

/** 지명·역명과 이름이 겹치는지. 겹치면 블로그 언급량을 액면 그대로 믿을 수 없다. */
const PLACEY_SUFFIX = /(동|가|길|로|거리|역|시장|해변|해수욕장|공원|마을)$/;

function looksPlacey(candidate, docs) {
  if (PLACEY_SUFFIX.test(candidate) && candidate.length >= 3) return true;
  // 검색 결과에 "<후보>역" 같은 지하철역이 섞여 있으면 지명일 가능성이 높다.
  return docs.some(
    (d) =>
      d.category_group_code === 'SW8' &&
      norm(d.place_name).startsWith(norm(candidate)),
  );
}

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
    if (!CAFE_KIND.test(d.category_name)) continue;
    if (CHAIN.test(d.place_name)) continue;

    const np = norm(d.place_name);
    // 지점명이 붙는 경우(예: "테라로사 강릉본점")를 고려해 양방향 포함을 허용하되,
    // 후보가 너무 짧으면 오매칭이 급증하므로 완전일치만 인정한다.
    const nameOk = nc.length >= 3 ? np.includes(nc) || nc.includes(np) : np === nc;
    if (!nameOk) continue;

    // 도로명이 비어 있는 곳이 있어 지번도 함께 본다. 둘 중 하나라도 맞으면 통과.
    const road = d.road_address_name || '';
    const jibun = d.address_name || '';
    if (
      !addressMatchesRegion(road, region) &&
      !addressMatchesRegion(jibun, region)
    ) {
      continue;
    }

    return {
      id: d.id,
      name: d.place_name,
      lat: Number(d.y),
      lng: Number(d.x),
      address: road || jibun,
      phone: d.phone || undefined,
      categoryName: d.category_name,
      placeUrl: d.place_url,
      placey: looksPlacey(candidate, docs),
    };
  }
  return null;
}

/**
 * 카카오 카테고리 + 블로그 본문 → 앱 내부 카테고리.
 *
 * 본문은 글 하나하나를 따로 세어 "몇 %의 글이 그 얘기를 하는가"로 판정한다.
 * 전부 이어붙인 덩어리에서 찾으면 글 하나만 '브런치'를 언급해도 브런치집이 되어버려서,
 * 결국 모든 가게가 모든 카테고리를 달게 된다.
 */
export function toCategories(categoryName, contexts = []) {
  const out = new Set();
  const ratio = (re) => {
    if (!contexts.length) return 0;
    return contexts.filter((c) => re.test(c)).length / contexts.length;
  };

  // 카카오 카테고리는 단정적인 근거라 그대로 신뢰한다.
  if (/베이커리|제과/.test(categoryName)) out.add('bakery');
  if (/디저트/.test(categoryName)) out.add('dessert');
  if (/카페|커피/.test(categoryName)) out.add('cafe');

  // 본문 근거는 3분의 1 이상이 같은 얘기를 할 때만 인정한다.
  if (ratio(/베이커리|빵집|빵이|빵을|소금빵|크루아상/) >= 0.34) out.add('bakery');
  if (ratio(/브런치/) >= 0.34) out.add('brunch');
  if (ratio(/디저트|케이크|도넛|타르트/) >= 0.34) out.add('dessert');

  if (out.size === 0) out.add('cafe');
  return [...out];
}
