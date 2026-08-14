import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView';
import Filters from './components/Filters';
import PlaceList from './components/PlaceList';
import PlaceDetail from './components/PlaceDetail';
import RegionBrowser from './components/RegionBrowser';
import SavedView from './components/SavedView';
import TabBar, { type Tab } from './components/TabBar';
import { loadRecords, saveRecords } from './lib/storage';
import {
  distanceKm,
  getCurrentPosition,
  type FocusTarget,
  type LatLng,
} from './lib/geo';
import { searchRegion } from './lib/geocode';
import type { Category, PlaceDetails, PlacesFile, UserRecord } from './types';

/** 지역을 찾아 옮겨갔을 때의 지도 배율. 동네 하나가 화면에 들어오는 정도. */
const NEARBY_LEVEL = 5;
/** 시군구 하나를 고른 경우. 읍·면 단위보다 넓게 잡는다. */
const REGION_LEVEL = 7;

const ALL_CATEGORIES: Category[] = ['bakery', 'brunch', 'cafe', 'dessert'];

type Sort = 'score' | 'distance' | 'new';

const SORT_LABEL: Record<Sort, string> = {
  score: '평판순',
  distance: '거리순',
  new: '최신순',
};

/** 링크 하나로 "강릉 베이커리 목록"이나 특정 가게를 통째로 공유할 수 있게 한다. */
function readUrlState() {
  const q = new URLSearchParams(location.search);
  const cats = (q.get('cat') ?? '')
    .split(',')
    .filter((c): c is Category => (ALL_CATEGORIES as string[]).includes(c));
  const sigungu = q.get('sigungu');
  return {
    categories: new Set<Category>(cats),
    tags: new Set((q.get('tag') ?? '').split(',').filter(Boolean)),
    query: q.get('q') ?? '',
    place: q.get('place'),
    region: sigungu ? { sido: q.get('sido') ?? '', sigungu } : null,
  };
}

export default function App() {
  const [data, setData] = useState<PlacesFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [details, setDetails] = useState<Map<string, PlaceDetails>>(new Map());

  const initial = useMemo(readUrlState, []);
  const [tab, setTab] = useState<Tab>(initial.region ? 'list' : 'map');
  const [categories, setCategories] = useState<Set<Category>>(initial.categories);
  const [tags, setTags] = useState<Set<string>>(initial.tags);
  const [query, setQuery] = useState(initial.query);
  const [regionFilter, setRegionFilter] = useState(initial.region);
  const [sort, setSort] = useState<Sort>('score');

  const [records, setRecords] = useState<Record<string, UserRecord>>(loadRecords);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  /** '찾기'로 옮겨간 지역. 여기가 있으면 거리는 내 위치가 아니라 이 지점 기준이다. */
  const [searchPin, setSearchPin] = useState<(LatLng & { name: string }) | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null);
  const [researchNonce, setResearchNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(initial.place);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/places.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`데이터를 불러오지 못했습니다 (HTTP ${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  // 사진·메뉴·후기는 지도가 먼저 뜬 뒤에 따로 받아온다.
  // 첫 화면을 붙잡지 않아야 하고, 없으면 없는 대로 동작해야 하므로 실패는 무시한다.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/details.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((file) => {
        if (!file?.details) return;
        setDetails(new Map(file.details.map((d: PlaceDetails) => [d.id, d])));
      })
      .catch(() => {});
  }, []);

  // 앱을 열면 바로 내 주변 지도를 띄운다.
  // 권한을 거부하거나 실패해도 조용히 넘어간다 — 시작하자마자 경고창이 뜨면
  // 링크로 들어온 사람까지 붙잡히므로, 공유 링크(가게·지역 지정)일 땐 아예 묻지 않는다.
  useEffect(() => {
    if (initial.place || initial.region) return;
    let cancelled = false;
    getCurrentPosition()
      .then((pos) => {
        if (cancelled) return;
        setUserPos(pos);
        setFocus({ ...pos, level: NEARBY_LEVEL });
        setSort('distance');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial.place, initial.region]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (categories.size) q.set('cat', [...categories].join(','));
    if (tags.size) q.set('tag', [...tags].join(','));
    if (query) q.set('q', query);
    if (regionFilter) {
      q.set('sido', regionFilter.sido);
      q.set('sigungu', regionFilter.sigungu);
    }
    const next = q.toString();
    history.replaceState(null, '', next ? `?${next}` : location.pathname);
  }, [categories, tags, query, regionFilter]);

  const places = data?.places ?? [];

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of places) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
  }, [places]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return places.filter((p) => {
      if (categories.size && !p.category.some((c) => categories.has(c))) return false;
      if (tags.size && ![...tags].every((t) => p.tags.includes(t))) return false;
      if (regionFilter && p.region.sigungu !== regionFilter.sigungu) return false;
      if (needle) {
        const hay = `${p.name} ${p.region.sido} ${p.region.sigungu} ${p.address}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [places, categories, tags, query, regionFilter]);

  // 거리의 기준점. 지역을 찾아 옮겨갔다면 그 동네가 기준이어야
  // "여기서 가까운 곳"이 말이 된다. 아니면 내 위치.
  const origin = searchPin ?? userPos;

  const distances = useMemo(() => {
    const m = new Map<string, number>();
    if (!origin) return m;
    for (const p of filtered) m.set(p.id, distanceKm(origin, p));
    return m;
  }, [filtered, origin]);

  const sortRows = useCallback(
    <T extends { id: string; score: number; firstSeen: string }>(rows: T[]) => {
      const out = [...rows];
      if (sort === 'distance' && origin) {
        out.sort((a, b) => (distances.get(a.id) ?? 1e9) - (distances.get(b.id) ?? 1e9));
      } else if (sort === 'new') {
        out.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || b.score - a.score);
      } else {
        out.sort((a, b) => b.score - a.score);
      }
      return out;
    },
    [sort, origin, distances],
  );

  /** 지도 탭의 리스트는 "지금 화면에 보이는 곳"만 — 지도와 목록이 따로 놀지 않게. */
  const sheetRows = useMemo(() => {
    const visible = visibleIds ? new Set(visibleIds) : null;
    const rows = visible ? filtered.filter((p) => visible.has(p.id)) : filtered;
    return sortRows(rows).slice(0, 100);
  }, [filtered, visibleIds, sortRows]);

  /** 목록 탭은 화면 범위와 무관하게 필터 결과 전체를 보여준다. */
  const listRows = useMemo(() => sortRows(filtered).slice(0, 300), [filtered, sortRows]);

  const wishes = useMemo(
    () => new Set(Object.entries(records).filter(([, r]) => r.wish).map(([id]) => id)),
    [records],
  );

  const selected = selectedId ? (places.find((p) => p.id === selectedId) ?? null) : null;

  const nearby = useMemo(() => {
    if (!selected) return [];
    return places
      .filter((p) => p.id !== selected.id)
      .map((p) => ({ p, d: distanceKm(selected, p) }))
      .filter((x) => x.d <= 3)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.p);
  }, [selected, places]);

  const updateRecord = useCallback((id: string, patch: UserRecord) => {
    setRecords((prev) => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      saveRecords(next);
      return next;
    });
  }, []);

  const handleLocate = useCallback(async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      setUserPos(pos);
      setSearchPin(null); // 내 위치로 돌아왔으니 찾아둔 지역 기준은 푼다
      setFindError(null);
      setFocus({ ...pos, level: NEARBY_LEVEL });
      setSort('distance');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLocating(false);
    }
  }, []);

  /**
   * 입력한 지역으로 지도를 옮기고 그 주변을 보여준다.
   * 검색어는 지도를 옮긴 뒤 비운다 — 글자로 목록까지 걸러버리면
   * 정작 "주변에 뭐가 있나"를 못 보기 때문이다. 대신 어디로 왔는지는 칩으로 남긴다.
   */
  const handleFind = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setFinding(true);
    setFindError(null);
    try {
      const hit = await searchRegion(q);
      if (!hit) {
        setFindError(`'${q}' 위치를 찾지 못했습니다. 시·군·구나 읍·면·동 이름으로 해보세요.`);
        return;
      }
      setSearchPin({ lat: hit.lat, lng: hit.lng, name: hit.name });
      setFocus({ lat: hit.lat, lng: hit.lng, level: NEARBY_LEVEL });
      setQuery('');
      setRegionFilter(null); // 지역 필터가 남아 있으면 옮겨간 동네가 통째로 가려진다
      setSort('distance');
      setTab('map');
    } catch (e) {
      setFindError((e as Error).message);
    } finally {
      setFinding(false);
    }
  }, [query]);

  /**
   * 시군구를 고르면 지도도 그리로 옮긴다.
   *
   * 이게 없으면 '지역'에서 강릉시를 골라도 지도는 서울에 남아 있고,
   * 목록은 강릉만 남아 있으니 화면에 마커가 하나도 없는 빈 지도가 된다.
   * 중심은 그 지역 가게들의 평균 좌표로 잡는다 — 행정 경계를 따로 안 받아도
   * 실제로 가게가 몰린 쪽이 화면에 들어온다.
   */
  const focusRegion = useCallback(
    (sido: string, sigungu: string, rows = places) => {
      const hit = rows.filter(
        (p) => p.region.sido === sido && p.region.sigungu === sigungu,
      );
      if (!hit.length) return;
      setFocus({
        lat: hit.reduce((s, p) => s + p.lat, 0) / hit.length,
        lng: hit.reduce((s, p) => s + p.lng, 0) / hit.length,
        level: REGION_LEVEL,
      });
    },
    [places],
  );

  // 공유 링크(?sigungu=)로 들어온 경우에도 데이터가 도착하는 대로 그 지역을 비춘다.
  const linkedRegionShown = useRef(false);
  useEffect(() => {
    if (linkedRegionShown.current || !initial.region || !places.length) return;
    linkedRegionShown.current = true;
    focusRegion(initial.region.sido, initial.region.sigungu, places);
  }, [places, initial.region, focusRegion]);

  /**
   * 지금 보고 있는 지도 범위로 다시 찾는다.
   *
   * 줌아웃했는데 다른 지역이 안 나오는 건 대개 필터가 남아 있어서다 —
   * '지역' 탭에서 시군구를 고르면 그 지역만 남고, 검색어가 있으면 이름이
   * 안 맞는 곳이 통째로 빠진다. 지도만 넓혀도 걸러진 곳은 돌아오지 않는다.
   * 그래서 이 버튼은 범위를 다시 훑기 전에 그 두 필터를 먼저 푼다.
   */
  const handleResearch = useCallback(() => {
    setRegionFilter(null);
    setQuery('');
    setFindError(null);
    setResearchNonce((n) => n + 1);
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      const p = places.find((x) => x.id === id);
      if (p) setFocus({ lat: p.lat, lng: p.lng });
    },
    [places],
  );

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  };

  if (loadError) {
    return (
      <div className="fatal">
        <h1>빵집지도</h1>
        <p>{loadError}</p>
      </div>
    );
  }

  const sortBar = (
    <div className="sortbar">
      {(['score', 'distance', 'new'] as Sort[]).map((s) => (
        <button
          key={s}
          className={`sortbtn ${sort === s ? 'on' : ''}`}
          onClick={() => {
            if (s === 'distance' && !origin) {
              handleLocate();
              return;
            }
            setSort(s);
          }}
        >
          {SORT_LABEL[s]}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`app tab-${tab}`}>
      {/* 지도는 탭을 옮겨도 상태를 잃지 않도록 항상 마운트해 두고 숨긴다. */}
      <div className="map-layer" hidden={tab !== 'map'}>
        <MapView
          places={filtered}
          selectedId={selectedId}
          userPos={userPos}
          focus={focus}
          onSelect={handleSelect}
          onVisibleChange={setVisibleIds}
          researchNonce={researchNonce}
          visible={tab === 'map'}
          details={details}
        />
        <button className="research" onClick={handleResearch}>
          ↻ 현위치에서 재검색
        </button>
      </div>

      {(tab === 'map' || tab === 'list') && (
        <header className="topbar">
          <Filters
            categories={categories}
            tags={tags}
            availableTags={availableTags}
            query={query}
            onToggleCategory={(c) => setCategories((s) => toggle(s, c))}
            onToggleTag={(t) => setTags((s) => toggle(s, t))}
            onQueryChange={setQuery}
            onLocate={handleLocate}
            locating={locating}
            onFind={handleFind}
            finding={finding}
            findError={findError}
          />
          {(regionFilter || searchPin) && (
            <div className="region-chip-row">
              {searchPin && (
                <button
                  className="region-chip pin"
                  onClick={() => {
                    setSearchPin(null);
                    setSort('score');
                  }}
                >
                  📍 {searchPin.name} ✕
                </button>
              )}
              {regionFilter && (
                <button className="region-chip" onClick={() => setRegionFilter(null)}>
                  {regionFilter.sido} {regionFilter.sigungu} ✕
                </button>
              )}
            </div>
          )}
        </header>
      )}

      {tab === 'map' && (
        <section className={`sheet ${expanded ? 'expanded' : ''}`}>
          <button
            className="sheet-handle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <span className="grip" />
            <span className="sheet-count">
              {data ? `이 지역 ${sheetRows.length}곳` : '불러오는 중…'}
            </span>
          </button>
          <div className="sheet-body">
            {sortBar}
            <PlaceList
              places={sheetRows}
              distances={distances}
              wishes={wishes}
              records={records}
              total={places.length}
              onSelect={(id) => {
                handleSelect(id);
                setExpanded(false);
              }}
            />
          </div>
        </section>
      )}

      {tab === 'list' && (
        <main className="panel">
          <div className="panel-head">
            <span className="panel-count">{listRows.length}곳</span>
            {sortBar}
          </div>
          <div className="panel-body">
            <PlaceList
              places={listRows}
              distances={distances}
              wishes={wishes}
              records={records}
              total={places.length}
              onSelect={handleSelect}
              showRegion
            />
          </div>
        </main>
      )}

      {tab === 'region' && (
        <main className="panel">
          <div className="panel-head">
            <h1 className="panel-title">지역으로 찾기</h1>
          </div>
          <div className="panel-body">
            <RegionBrowser
              places={places}
              onPick={(sido, sigungu) => {
                setRegionFilter({ sido, sigungu });
                focusRegion(sido, sigungu);
                setTab('list');
              }}
            />
          </div>
        </main>
      )}

      {tab === 'saved' && (
        <main className="panel">
          <div className="panel-head">
            <h1 className="panel-title">내 저장</h1>
          </div>
          <div className="panel-body">
            <SavedView
              places={places}
              records={records}
              distances={distances}
              onSelect={handleSelect}
            />
          </div>
        </main>
      )}

      <TabBar tab={tab} savedCount={wishes.size} onChange={setTab} />

      {selected && (
        <>
          <div className="scrim" onClick={() => setSelectedId(null)} />
          <PlaceDetail
            place={selected}
            detail={details.get(selected.id)}
            nearby={nearby}
            distanceKm={origin ? distanceKm(origin, selected) : null}
            record={records[selected.id]}
            onClose={() => setSelectedId(null)}
            onToggleWish={() =>
              updateRecord(selected.id, { wish: !records[selected.id]?.wish })
            }
            onRate={(rating) =>
              updateRecord(selected.id, {
                visited: { date: new Date().toISOString().slice(0, 10), rating },
              })
            }
            onSelect={handleSelect}
          />
        </>
      )}
    </div>
  );
}
