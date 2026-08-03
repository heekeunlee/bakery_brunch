#!/usr/bin/env node
/**
 * 수집 파이프라인 오케스트레이터.
 *
 *   블로그 검색 → 상호 후보 추출 → 카카오 검증/보강 → 스코어링 → places.json 병합
 *
 * 사용 예:
 *   node scripts/run.mjs --region 강릉시
 *   node scripts/run.mjs --shard auto --shards 7     (매일 1/7씩 순환)
 *   node scripts/run.mjs --all --limit 5
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { searchBlog, blogTotal } from './lib/naver.mjs';
import { verifyPlace, toCategories } from './lib/kakao.mjs';
import { extractCandidates, extractTags, extractHours } from './lib/extract.mjs';
import { mentionScore, buzzScore, totalScore } from './lib/score.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGIONS_PATH = join(ROOT, 'data', 'regions.json');
// 프런트가 그대로 fetch 할 수 있도록 public 아래에 쓴다.
const PLACES_PATH = join(ROOT, 'public', 'data', 'places.json');

const KEYWORDS = ['베이커리카페 추천', '브런치카페 추천', '카페 추천', '빵집 추천'];

/** 한 지역에서 카카오 검증까지 보낼 후보 수 상한. 쿼터 방어선. */
const MAX_VERIFY_PER_REGION = 120;

function parseArgs(argv) {
  const args = { shards: 7 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--region') args.region = argv[++i];
    else if (a === '--shard') args.shard = argv[++i];
    else if (a === '--shards') args.shards = Number(argv[++i]);
    else if (a === '--all') args.all = true;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function pickRegions(regions, args) {
  if (args.region) {
    const hit = regions.filter(
      (r) => r.sigungu === args.region || r.sigungu.startsWith(args.region),
    );
    if (!hit.length) throw new Error(`알 수 없는 지역: ${args.region}`);
    return hit;
  }
  if (args.shard != null) {
    const shards = args.shards || 7;
    let idx;
    if (args.shard === 'auto') {
      // 연중 일수 기준으로 매일 다른 조각을 처리해 일주일이면 전국을 한 바퀴 돈다.
      const start = Date.UTC(new Date().getUTCFullYear(), 0, 0);
      idx = Math.floor((Date.now() - start) / 86400000) % shards;
    } else {
      idx = Number(args.shard) % shards;
    }
    const picked = regions.filter((_, i) => i % shards === idx);
    console.log(`샤드 ${idx + 1}/${shards} — ${picked.length}개 지역`);
    return picked;
  }
  if (args.all) return args.limit ? regions.slice(0, args.limit) : regions;
  throw new Error('--region, --shard, --all 중 하나를 지정하세요.');
}

async function collectRegion(region) {
  console.log(`\n▶ ${region.sido} ${region.sigungu}`);

  // [1] 블로그 수집
  const items = [];
  for (const kw of KEYWORDS) {
    const query = `${region.sigungu} ${kw}`;
    try {
      const got = await searchBlog(query, { pages: 2, sort: 'sim' });
      items.push(...got);
      // 최신순도 섞어 신규 오픈 카페를 놓치지 않는다.
      const fresh = await searchBlog(query, { pages: 1, sort: 'date' });
      items.push(...fresh);
    } catch (err) {
      console.warn(`  ! 블로그 검색 실패 (${query}): ${err.message}`);
    }
  }
  console.log(`  블로그 ${items.length}건 수집`);
  if (!items.length) return [];

  // [2] 후보 추출 → 빈도순 정렬
  const candidates = extractCandidates(items, region);
  const ranked = [...candidates.entries()]
    .map(([name, v]) => ({ name, mentions: v.posts.size, text: v.text.join(' ') }))
    .sort((a, b) => b.mentions - a.mentions);

  // 2회 이상 언급을 우선 검증하고, 남는 예산으로 1회 언급까지 훑는다.
  const multi = ranked.filter((c) => c.mentions >= 2);
  const single = ranked.filter((c) => c.mentions === 1);
  const queue = [...multi, ...single].slice(0, MAX_VERIFY_PER_REGION);
  console.log(`  후보 ${ranked.length}개 → 검증 대상 ${queue.length}개 (2회이상 ${multi.length})`);

  // [3] 카카오 검증 + 보강
  const found = new Map();
  for (const cand of queue) {
    let place;
    try {
      place = await verifyPlace(cand.name, region);
    } catch (err) {
      console.warn(`  ! 카카오 검증 실패 (${cand.name}): ${err.message}`);
      continue;
    }
    if (!place) continue;

    const prev = found.get(place.id);
    if (prev) {
      // 같은 가게가 여러 표기로 잡히면 언급수를 합친다.
      prev.mentions += cand.mentions;
      prev.text += ' ' + cand.text;
      continue;
    }
    found.set(place.id, { ...place, mentions: cand.mentions, text: cand.text });
  }
  console.log(`  검증 통과 ${found.size}곳`);

  // [4] 스코어 + 부가정보
  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  for (const p of found.values()) {
    let total = 0;
    try {
      total = await blogTotal(`${region.sigungu} ${p.name}`);
    } catch {
      /* buzz 는 보조 지표라 실패해도 진행한다 */
    }

    const parts = { mention: mentionScore(p.mentions), buzz: buzzScore(total), mine: null };
    results.push({
      id: p.id,
      name: p.name,
      category: toCategories(p.categoryName, p.text),
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      region: { sido: region.sido, sigungu: region.sigungu },
      score: totalScore(parts),
      scoreParts: {
        mention: Math.round(parts.mention * 100) / 100,
        buzz: Math.round(parts.buzz * 100) / 100,
        mine: null,
      },
      mentions: p.mentions,
      tags: extractTags(p.text),
      ...extractHours(p.text),
      phone: p.phone,
      placeUrl: p.placeUrl,
      firstSeen: today,
      lastSeen: today,
    });
  }
  return results;
}

/** 기존 데이터와 병합. firstSeen 은 보존하고, 이번에 안 돈 지역은 그대로 둔다. */
function merge(existing, fresh, processedRegions) {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const processed = new Set(processedRegions.map((r) => `${r.sido}/${r.sigungu}`));

  for (const p of fresh) {
    const prev = byId.get(p.id);
    byId.set(p.id, prev ? { ...p, firstSeen: prev.firstSeen } : p);
  }

  // 이번 회차에 돈 지역인데 결과에 없다면 폐업 가능성 — 바로 지우지 않고
  // lastSeen 이 오래된 것만 나중에 정리할 수 있게 남겨둔다.
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

async function main() {
  const args = parseArgs(process.argv);
  const regions = JSON.parse(await readFile(REGIONS_PATH, 'utf8'));
  const targets = pickRegions(regions, args);

  let existing = [];
  try {
    const file = JSON.parse(await readFile(PLACES_PATH, 'utf8'));
    existing = file.places ?? [];
  } catch {
    console.log('기존 places.json 없음 — 새로 만듭니다.');
  }

  const fresh = [];
  for (const region of targets) {
    fresh.push(...(await collectRegion(region)));
  }

  const places = merge(existing, fresh, targets);
  const newCount = places.filter(
    (p) => !existing.some((e) => e.id === p.id),
  ).length;

  const out = {
    generatedAt: new Date().toISOString(),
    count: places.length,
    places,
  };

  if (args.dryRun) {
    console.log(`\n[dry-run] 총 ${places.length}곳 (신규 ${newCount}곳) — 저장하지 않음`);
    return;
  }

  await writeFile(PLACES_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\n✓ ${PLACES_PATH}`);
  console.log(`  총 ${places.length}곳 / 이번 회차 신규 ${newCount}곳`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
