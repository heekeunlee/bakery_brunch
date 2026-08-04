import { useCallback, useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView';
import Filters from './components/Filters';
import PlaceList from './components/PlaceList';
import PlaceDetail from './components/PlaceDetail';
import RegionBrowser from './components/RegionBrowser';
import SavedView from './components/SavedView';
import TabBar, { type Tab } from './components/TabBar';
import { loadRecords, saveRecords } from './lib/storage';
import { distanceKm, getCurrentPosition, type LatLng } from './lib/geo';
import type { Category, PlacesFile, UserRecord } from './types';

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
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null);
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

  const distances = useMemo(() => {
    const m = new Map<string, number>();
    if (!userPos) return m;
    for (const p of filtered) m.set(p.id, distanceKm(userPos, p));
    return m;
  }, [filtered, userPos]);

  const sortRows = useCallback(
    <T extends { id: string; score: number; firstSeen: string }>(rows: T[]) => {
      const out = [...rows];
      if (sort === 'distance' && userPos) {
        out.sort((a, b) => (distances.get(a.id) ?? 1e9) - (distances.get(b.id) ?? 1e9));
      } else if (sort === 'new') {
        out.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || b.score - a.score);
      } else {
        out.sort((a, b) => b.score - a.score);
      }
      return out;
    },
    [sort, userPos, distances],
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
      setFocus(pos);
      setSort('distance');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLocating(false);
    }
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
            if (s === 'distance' && !userPos) {
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
        />
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
          />
          {regionFilter && (
            <div className="region-chip-row">
              <button className="region-chip" onClick={() => setRegionFilter(null)}>
                {regionFilter.sido} {regionFilter.sigungu} ✕
              </button>
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
            nearby={nearby}
            distanceKm={userPos ? distanceKm(userPos, selected) : null}
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
