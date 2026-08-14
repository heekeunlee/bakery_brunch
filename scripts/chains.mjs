#!/usr/bin/env node
/**
 * 전국 스타벅스 매장 수집.
 *
 * 평판 랭킹에는 넣지 않는다 — 블로그 언급량으로 점수를 매기는 구조에서 체인점은
 * 언제나 상위를 독식하고, "잘하는 동네 빵집을 찾는다"는 목적과도 어긋난다.
 * 다만 여행 중에는 "확실한 곳 하나"가 필요할 때가 있어 지도 위 별도 레이어로만 둔다.
 *
 * 카카오 키워드 검색은 한 번에 최대 45건(15건 × 3페이지)만 준다. 전국 1,900여 개를
 * 다 받으려면 영역을 잘게 쪼개는 수밖에 없어, 사각형을 재귀로 4등분한다.
 *
 * 사용 예:
 *   node scripts/chains.mjs --dry-run
 *   node scripts/chains.mjs
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getJson } from './lib/http.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(ROOT, 'public', 'data', 'chains.json');

const ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const BRAND = '스타벅스';

/** 한 쿼리가 돌려줄 수 있는 최대치. 이보다 많으면 영역을 더 쪼개야 한다. */
const PAGE_CAP = 45;
/** 더 쪼개도 소용없는 크기(약 500m). 무한 재귀 방어선. */
const MIN_SPAN = 0.005;

// 남한 전역을 덮는 사각형.
const KOREA = { west: 125.0, south: 33.0, east: 132.0, north: 38.7 };

function headers() {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) throw new Error('KAKAO_REST_KEY 환경변수가 필요합니다.');
  return { Authorization: `KakaoAK ${key}` };
}

async function searchRect(rect, page) {
  const url =
    `${ENDPOINT}?query=${encodeURIComponent(BRAND)}&size=15&page=${page}` +
    `&rect=${rect.west},${rect.south},${rect.east},${rect.north}`;
  return getJson(url, headers());
}

const SIDO_ALIAS = [
  [/^서울/, '서울'], [/^부산/, '부산'], [/^대구/, '대구'], [/^인천/, '인천'],
  [/^광주/, '광주'], [/^대전/, '대전'], [/^울산/, '울산'],
  [/^세종/, '세종'], [/^경기/, '경기'], [/^강원/, '강원'],
  [/^(충북|충청북도)/, '충북'], [/^(충남|충청남도)/, '충남'],
  [/^(전북|전라북도)/, '전북'], [/^(전남|전라남도)/, '전남'],
  [/^(경북|경상북도)/, '경북'], [/^(경남|경상남도)/, '경남'], [/^제주/, '제주'],
];

/** 통합 이후 광주 쪽 자치구. 전남에는 같은 이름의 구가 없어 이걸로 가른다. */
const GWANGJU_GU = new Set(['동구', '서구', '남구', '북구', '광산구']);

/**
 * "전남광주통합특별시 북구 ..." → 광주 북구
 * "전남광주통합특별시 여수시 ..." → 전남 여수시
 *
 * 광주와 전남이 한 시도로 합쳐지면서 주소 앞머리가 같아졌다. 앞머리만 보면
 * 전남 매장이 전부 광주로 들어가 전남이 0곳이 된다(실제로 그랬다).
 */
function parseRegion(address) {
  const parts = (address || '').split(/\s+/);
  const head = parts[0] ?? '';
  const sigungu = parts[1] ?? head;
  if (/^전남광주통합특별시/.test(head)) {
    return { sido: GWANGJU_GU.has(sigungu) ? '광주' : '전남', sigungu };
  }
  const sido = SIDO_ALIAS.find(([re]) => re.test(head))?.[1] ?? head;
  return { sido, sigungu };
}

async function collect(rect, found, depth = 0) {
  const first = await searchRect(rect, 1);
  const total = first.meta?.total_count ?? 0;
  if (total === 0) return;

  const spanX = rect.east - rect.west;
  const spanY = rect.north - rect.south;

  // 담을 수 있는 양을 넘으면 4등분해서 다시 센다.
  if (total > PAGE_CAP && spanX > MIN_SPAN && spanY > MIN_SPAN) {
    const midX = (rect.west + rect.east) / 2;
    const midY = (rect.south + rect.north) / 2;
    for (const q of [
      { west: rect.west, south: rect.south, east: midX, north: midY },
      { west: midX, south: rect.south, east: rect.east, north: midY },
      { west: rect.west, south: midY, east: midX, north: rect.north },
      { west: midX, south: midY, east: rect.east, north: rect.north },
    ]) {
      await collect(q, found, depth + 1);
    }
    return;
  }

  const take = (docs) => {
    for (const d of docs ?? []) {
      // 검색어가 '스타벅스'라도 "스타벅스 앞 정류장" 같은 게 섞인다. 카페만 남긴다.
      if (!d.place_name.includes(BRAND)) continue;
      if (d.category_group_code !== 'CE7') continue;
      const address = d.road_address_name || d.address_name || '';
      found.set(d.id, {
        id: d.id,
        name: d.place_name,
        brand: BRAND,
        lat: Number(d.y),
        lng: Number(d.x),
        address,
        region: parseRegion(address),
        phone: d.phone || undefined,
        placeUrl: d.place_url,
      });
    }
  };

  take(first.documents);
  let page = 2;
  let meta = first.meta;
  while (!meta?.is_end && page <= 3) {
    const res = await searchRect(rect, page);
    take(res.documents);
    meta = res.meta;
    page++;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const found = new Map();

  console.log('전국을 훑는 중…');
  await collect(KOREA, found);

  const stores = [...found.values()].sort((a, b) =>
    `${a.region.sido}${a.region.sigungu}${a.name}`.localeCompare(
      `${b.region.sido}${b.region.sigungu}${b.name}`,
      'ko',
    ),
  );

  const bySido = {};
  for (const s of stores) bySido[s.region.sido] = (bySido[s.region.sido] ?? 0) + 1;
  console.log(`\n${BRAND} ${stores.length}곳`);
  console.log(
    Object.entries(bySido)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join('  '),
  );

  if (dryRun) {
    console.log('\n[dry-run] 저장하지 않음');
    return;
  }

  await writeFile(
    OUT_PATH,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      count: stores.length,
      stores,
    }) + '\n',
    'utf8',
  );
  console.log(`\n✓ ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
