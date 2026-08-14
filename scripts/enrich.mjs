#!/usr/bin/env node
/**
 * 부가 정보 수집. places.json 의 가게들에 사진·메뉴·블로그·편의시설을 붙여
 * details.json 을 만든다.
 *
 * 왜 파일을 나누나 — places.json 은 지도와 목록이 첫 화면에서 바로 필요로 한다.
 * 부가 정보까지 합치면 첫 로딩이 배로 무거워지므로, 상세 정보는 따로 두고
 * 앱이 지도를 그린 뒤 뒤에서 받아온다.
 *
 * 사용 예:
 *   node scripts/enrich.mjs --limit 5 --dry-run
 *   node scripts/enrich.mjs --top 800        (평판 상위부터)
 *   node scripts/enrich.mjs --all
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { searchBlog, searchImage } from './lib/naver.mjs';
import { searchNearby } from './lib/kakao.mjs';
import {
  baseName,
  extractMenus,
  pickBlogs,
  extractKids,
  extractParkingHint,
  pickPhoto,
  relevant,
} from './lib/enrich.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLACES_PATH = join(ROOT, 'public', 'data', 'places.json');
const DETAILS_PATH = join(ROOT, 'public', 'data', 'details.json');

/** 주변 시설을 "이 가게 걸어서 갈 만한 거리"로 볼 반경. */
const PARKING_RADIUS = 300;
const EV_RADIUS = 700;

/** 한 번 붙인 정보를 다시 캐지 않을 기간. 메뉴·가격은 이 정도면 충분히 최신이다. */
const FRESH_DAYS = 30;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--top') args.top = Number(argv[++i]);
    else if (a === '--all') args.all = true;
    else if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

const daysSince = (iso) =>
  iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : Infinity;

async function enrichPlace(place) {
  const q = `${place.region.sigungu} ${place.name}`;

  // 후기 글. 메뉴·아이동반·주차 판단까지 이 한 번의 결과를 돌려 쓴다.
  let reviews = [];
  try {
    reviews = await searchBlog(q, { pages: 1, sort: 'sim' });
  } catch (err) {
    console.warn(`  ! 블로그 실패 (${q}): ${err.message}`);
  }

  // 가격은 후기 글보다 "메뉴 가격"을 노린 글에 훨씬 자주 적혀 있다.
  let priced = [];
  try {
    priced = await searchBlog(`${place.name} 메뉴 가격`, { pages: 1, sort: 'sim' });
  } catch {
    /* 메뉴는 없으면 없는 대로 둔다 */
  }

  let photo;
  try {
    // 이미지 검색은 지역을 붙이면 관광지 사진에 밀려 적중률이 반으로 떨어진다(4/10 → 8/10).
    // 다만 '하루'·'타네'처럼 두 글자 이름은 지역이 없으면 아무 사진이나 걸리므로 그때만 붙인다.
    const key = baseName(place.name);
    photo = pickPhoto(await searchImage(key.length <= 2 ? q : place.name), place.name);
  } catch {
    /* 사진은 보조 정보 */
  }

  let parking;
  let ev;
  try {
    parking = await searchNearby({
      lat: place.lat, lng: place.lng, radius: PARKING_RADIUS, categoryCode: 'PK6',
    });
    ev = await searchNearby({
      lat: place.lat, lng: place.lng, radius: EV_RADIUS, query: '전기차충전소',
    });
  } catch (err) {
    console.warn(`  ! 주변시설 실패 (${place.name}): ${err.message}`);
  }

  // 상호가 실제로 언급된 글만 근거로 삼는다.
  const all = relevant([...reviews, ...priced], place.name);
  return {
    id: place.id,
    photo,
    menus: extractMenus(all),
    blogs: pickBlogs(relevant(reviews, place.name)),
    facility: {
      parkingHint: extractParkingHint(all),
      parkingNearby: parking?.count ?? 0,
      parkingNearest: parking?.nearest,
      evNearby: ev?.count ?? 0,
      evNearest: ev?.nearest,
      kids: extractKids(all),
    },
    enrichedAt: new Date().toISOString().slice(0, 10),
  };
}

function pickTargets(places, existing, args) {
  const byId = new Map(existing.map((d) => [d.id, d]));
  const stale = (p) =>
    args.force || daysSince(byId.get(p.id)?.enrichedAt) > FRESH_DAYS;

  // 평판 높은 곳부터. 중간에 끊겨도 사람들이 실제로 열어보는 쪽은 채워져 있다.
  const ranked = [...places].sort((a, b) => b.score - a.score).filter(stale);
  if (args.limit) return ranked.slice(0, args.limit);
  if (args.top) return ranked.slice(0, args.top);
  if (args.all) return ranked;
  throw new Error('--limit, --top, --all 중 하나를 지정하세요.');
}

async function main() {
  const args = parseArgs(process.argv);
  const places = JSON.parse(await readFile(PLACES_PATH, 'utf8')).places ?? [];

  let existing = [];
  try {
    existing = JSON.parse(await readFile(DETAILS_PATH, 'utf8')).details ?? [];
  } catch {
    console.log('기존 details.json 없음 — 새로 만듭니다.');
  }

  const targets = pickTargets(places, existing, args);
  console.log(`대상 ${targets.length}곳 / 전체 ${places.length}곳 (기존 ${existing.length}곳)`);

  const byId = new Map(existing.map((d) => [d.id, d]));
  const save = async () => {
    const details = [...byId.values()];
    // 들여쓰기 없이 쓴다. 사람이 읽을 파일이 아니고, 5,500곳이면 들여쓰기만으로
    // 3MB 가까이 불어난다. 앱이 뒤에서 받아오는 파일이라 용량이 그대로 체감된다.
    await writeFile(
      DETAILS_PATH,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        count: details.length,
        details,
      }) + '\n',
      'utf8',
    );
  };

  for (const [i, place] of targets.entries()) {
    const got = await enrichPlace(place);
    byId.set(place.id, got);

    const bits = [
      got.photo ? '사진' : null,
      got.menus.length ? `메뉴${got.menus.length}` : null,
      got.blogs.length ? `블로그${got.blogs.length}` : null,
      got.facility.parkingNearby ? `주차${got.facility.parkingNearby}` : null,
      got.facility.evNearby ? `충전${got.facility.evNearby}` : null,
      got.facility.kids !== 'unknown' ? `아이:${got.facility.kids}` : null,
    ].filter(Boolean);
    console.log(
      `  [${i + 1}/${targets.length}] ${place.region.sigungu} ${place.name} — ` +
        (bits.join(' ') || '수집분 없음'),
    );

    // 몇 시간짜리 작업이라 중간에 끊겨도 여기까지는 남게 20곳마다 저장한다.
    if (!args.dryRun && (i + 1) % 20 === 0) await save();
  }

  if (args.dryRun) {
    console.log('\n[dry-run] 저장하지 않음');
    console.log(JSON.stringify([...byId.values()].slice(-3), null, 2));
    return;
  }

  await save();
  console.log(`\n✓ ${DETAILS_PATH}\n  총 ${byId.size}곳`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
