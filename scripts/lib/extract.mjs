/**
 * 블로그 검색 결과에서 상호 "후보"를 뽑아내는 단계.
 *
 * 정밀도를 높이려 애쓰지 않는다 — 후보는 헐겁게 많이 만들고,
 * 실제 걸러내기는 카카오 검증(kakao.verifyPlace)에 맡긴다.
 * "내돈내산" 같은 노이즈는 카카오에 존재하지 않으므로 자동으로 사라진다.
 */

/** 상호가 될 수 없는 단어들. 후보에서 통째로 제외한다. */
const STOPWORDS = new Set([
  '카페', '카페추천', '추천', '맛집', '베이커리', '베이커리카페', '브런치', '브런치카페',
  '빵집', '빵', '디저트', '커피', '커피숍', '오션뷰', '바다뷰', '뷰맛집', '뷰', '대형',
  '주차', '웨이팅', '여행', '가볼만한곳', '내돈내산', '후기', '솔직후기', '방문후기',
  '리뷰', '신상', '핫플', '핫플레이스', '성지', '근처', '데이트', '존맛', '분위기',
  '인생', '최고', '진짜', '요즘', '오늘', '이번', '지난', '다녀온', '다녀왔어요',
  '가성비', '실내', '야외', '루프탑', '테라스', '감성', '감성카페', '대형카페',
  '아이랑', '아기랑', '반려동물', '애견동반', '펫프렌들리', '노키즈존', '키즈존',
  '당일치기', '박이일', '코스', '정리', '모음', '총정리', '베스트', 'top', 'best',
  '메뉴', '가격', '영업시간', '휴무일', '위치', '주소', '전화번호', '예약',
  '소금빵', '크로플', '케이크', '스콘', '휘낭시에', '마카롱', '에그베네딕트',
]);

/** 후보 앞뒤에 붙어 오염시키는 접사들. STOPWORDS 와 지역명을 함께 쓴다. */
const AFFIXES = [...STOPWORDS];

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

/** 지역명 변형(강릉시 → 강릉, 강원특별자치도 → 강원)까지 만들어 접사 제거에 쓴다. */
function regionWords(region) {
  const words = new Set();
  for (const raw of [region.sido, region.sigungu, ...(region.aliases ?? [])]) {
    if (!raw) continue;
    words.add(raw);
    words.add(raw.replace(/특별자치도$|특별자치시$|광역시$|특별시$|자치도$|도$/, ''));
    words.add(raw.replace(/시$|군$|구$|읍$|면$/, ''));
  }
  return [...words].filter((w) => w.length >= 2);
}

/** 문자열 앞뒤에서 접사를 반복적으로 벗겨낸다. */
function stripAffixes(token, affixes) {
  let cur = token;
  let changed = true;
  while (changed && cur.length > 0) {
    changed = false;
    for (const a of affixes) {
      if (a.length >= cur.length) continue;
      if (cur.startsWith(a)) {
        cur = cur.slice(a.length);
        changed = true;
      }
      if (cur.endsWith(a)) {
        cur = cur.slice(0, -a.length);
        changed = true;
      }
    }
  }
  return cur;
}

/**
 * 후보가 불용어·지역명 조각만으로 이루어졌는지 검사한다.
 * stripAffixes 와 달리 앞뒤가 아니라 전역으로 지워버린 뒤 남는 게 있는지만 본다.
 * 남는 글자가 2자 미만이면 상호가 아니라 수식어 조합이다.
 */
function isAllAffix(token, affixes) {
  let rest = token.replace(/\s/g, '');
  for (const a of affixes) {
    if (!a) continue;
    rest = rest.split(a).join('');
    if (rest.length < 2) return true;
  }
  return rest.length < 2;
}

const VALID = /^[가-힣A-Za-z0-9][가-힣A-Za-z0-9&'.\s]{0,18}$/;

function isPlausible(token) {
  if (!token || token.length < 2 || token.length > 20) return false;
  if (STOPWORDS.has(token.toLowerCase())) return false;
  if (!VALID.test(token)) return false;
  if (/^\d+$/.test(token)) return false; // 순수 숫자("1박2일")
  if (/^(20\d\d|1박|2박|3박)/.test(token)) return false;
  return true;
}

/**
 * 블로그 아이템 배열 → 후보 맵.
 * @returns Map<candidate, { posts:Set<string>, text:string[] }>
 */
export function extractCandidates(items, region) {
  const affixes = [...AFFIXES, ...regionWords(region)].sort((a, b) => b.length - a.length);
  const candidates = new Map();

  const add = (raw, postId, context) => {
    if (!isPlausible(raw)) return;
    // 불용어와 지역명만으로 이루어진 후보("강릉 카페", "베이커리 카페")를 버린다.
    // 이런 것들은 빈도가 높은 데다 카카오 검색에서도 실존 카페에 매칭돼버리므로
    // 여기서 막지 않으면 엉뚱한 가게가 높은 점수로 올라온다.
    if (isAllAffix(raw, affixes)) return;
    let entry = candidates.get(raw);
    if (!entry) {
      entry = { posts: new Set(), contexts: [] };
      candidates.set(raw, entry);
    }
    // 같은 글에서 해시태그와 제목 토큰으로 두 번 걸려도 본문은 한 번만 담는다.
    // 그래야 뒤에서 "몇 %의 글이" 를 셀 때 분모가 맞는다.
    if (!entry.posts.has(postId) && entry.contexts.length < 20) {
      entry.contexts.push(context);
    }
    entry.posts.add(postId);
  };

  for (const item of items) {
    const title = decode(item.title ?? '');
    const desc = decode(item.description ?? '');
    const context = `${title} ${desc}`;
    // 같은 블로거가 여러 글을 써도 언급 1회로 취급 — 협찬/도배 완화.
    const postId = item.bloggerlink || item.link;

    // 1) 해시태그: 가장 신뢰도 높은 소스.
    for (const m of context.matchAll(/#([가-힣A-Za-z0-9]{2,25})/g)) {
      const tag = m[1];
      add(stripAffixes(tag, affixes), postId, context);
      add(tag, postId, context); // 접사 제거가 실명을 훼손한 경우 대비
    }

    // 2) 제목 토큰: 해시태그를 제거한 뒤 구분자로 쪼갠다.
    const cleanTitle = title.replace(/#[가-힣A-Za-z0-9]+/g, ' ');
    const tokens = cleanTitle
      .split(/[\s:：,，·|/()[\]{}<>!?~"'’“”…\-–—@]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    for (let i = 0; i < tokens.length; i++) {
      const one = tokens[i];
      add(one, postId, context);
      add(stripAffixes(one, affixes), postId, context);
      // 두 토큰짜리 상호("빵 명장", "카페 밀")도 잡는다.
      if (i + 1 < tokens.length) {
        add(`${one} ${tokens[i + 1]}`, postId, context);
      }
    }
  }

  return candidates;
}

/**
 * 본문에서 태그를 규칙으로 추출.
 * 카테고리와 같은 이유로 글 단위 비율을 본다 — 글 하나가 "주차하기 좋았다"고 썼다고
 * 주차가능 태그를 달면, 태그가 많아질수록 아무 의미가 없어진다.
 */
export function extractTags(contexts) {
  const list = Array.isArray(contexts) ? contexts : [contexts];
  if (!list.length) return [];
  const need = Math.max(2, Math.ceil(list.length * 0.3));

  const tags = [];
  const rules = [
    [/오션뷰|바다뷰|바다가\s*보이|해변\s*카페/, '오션뷰'],
    [/리버뷰|강뷰|호수뷰|계곡뷰/, '물뷰'],
    [/마운틴뷰|산뷰|숲뷰|숲속/, '산뷰'],
    [/대형\s*카페|넓은|규모가\s*큰|초대형/, '대형'],
    [/주차\s*(가능|장|무료)|전용\s*주차/, '주차가능'],
    [/반려동물|애견\s*동반|펫\s*프렌들리|강아지\s*동반/, '애견동반'],
    [/노키즈존/, '노키즈존'],
    [/키즈존|아이랑|아기랑|유아\s*의자/, '아이동반'],
    [/웨이팅|줄\s*서|대기\s*번호/, '웨이팅있음'],
    [/루프탑|테라스|야외\s*좌석/, '야외석'],
    [/브런치/, '브런치'],
    [/로스팅|로스터리|자가\s*배전/, '로스터리'],
    [/24시|24시간|밤늦게|심야/, '늦게까지'],
  ];
  for (const [re, tag] of rules) {
    if (list.filter((c) => re.test(c)).length >= need) tags.push(tag);
  }
  return [...new Set(tags)];
}

/** 영업시간 / 휴무일 추출. 블로그 본문 기반이라 부정확할 수 있다. */
export function extractHours(contexts) {
  const text = Array.isArray(contexts) ? contexts.join(' ') : contexts;
  const out = {};

  const hm = text.match(
    /영업\s*시간\s*[:：]?\s*([0-9]{1,2}\s*[:시]\s*[0-9]{0,2}\s*[-~–]\s*[0-9]{1,2}\s*[:시]\s*[0-9]{0,2})/,
  );
  if (hm) out.hours = hm[1].replace(/\s+/g, '');

  const cm = text.match(/휴무일?\s*[:：]?\s*([가-힣0-9\s,]{1,24}?)(?:\s{2,}|$|[.·|])/);
  if (cm) {
    const v = cm[1].trim();
    if (v && v.length <= 24 && !/없|연중무휴/.test(v)) out.closedDay = v;
    else if (/없|연중무휴/.test(v)) out.closedDay = '연중무휴';
  }

  return out;
}
