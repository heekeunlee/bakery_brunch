import { useCallback, useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView';
import Filters from './components/Filters';
import PlaceList from './components/PlaceList';
import PlaceDetail from './components/PlaceDetail';
import { loadRecords, saveRecords } from './lib/storage';
import { distanceKm, getCurrentPosition, type LatLng } from './lib/geo';
import type { Category, PlacesFile, UserRecord } from './types';

const ALL_CATEGORIES: Category[] = ['bakery', 'brunch', 'cafe', 'dessert'];

/** 링크 하나로 "강릉 베이커리 목록"을 통째로 공유할 수 있도록 상태를 URL 에 싣는다. */
function readUrlState() {
  const q = new URLSearchParams(location.search);
  const cats = (q.get('cat') ?? '')
    .split(',')
    .filter((c): c is Category => (ALL_CATEGORIES as string[]).includes(c));
  return {
    categories: new Set<Category>(cats),
    tags: new Set((q.get('tag') ?? '').split(',').filter(Boolean)),
    query: q.get('q') ?? '',
  };
}

export default function App() {
  const [data, setData] = useState<PlacesFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const initial = useMemo(readUrlState, []);
  const [categories, setCategories] = useState<Set<Category>>(initial.categories);
  const [tags, setTags] = useState<Set<string>>(initial.tags);
  const [query, setQuery] = useState(initial.query);
  const [onlyWish, setOnlyWish] = useState(false);

  const [records, setRecords] = useState<Record<string, UserRecord>>(loadRecords);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    const next = q.toString();
    history.replaceState(null, '', next ? `?${next}` : location.pathname);
  }, [categories, tags, query]);

  const places = data?.places ?? [];

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of places) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t);
  }, [places]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return places.filter((p) => {
      if (categories.size && !p.category.some((c) => categories.has(c))) return false;
      if (tags.size && ![...tags].every((t) => p.tags.includes(t))) return false;
      if (onlyWish && !records[p.id]?.wish) return false;
      if (needle) {
        const hay = `${p.name} ${p.region.sido} ${p.region.sigungu} ${p.address}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [places, categories, tags, query, onlyWish, records]);

  const distances = useMemo(() => {
    const m = new Map<string, number>();
    if (!userPos) return m;
    for (const p of filtered) m.set(p.id, distanceKm(userPos, p));
    return m;
  }, [filtered, userPos]);

  /** 리스트는 "지금 지도에 보이는 곳"만 — 지도와 목록이 따로 노는 걸 막는다. */
  const listed = useMemo(() => {
    const visible = visibleIds ? new Set(visibleIds) : null;
    const rows = visible ? filtered.filter((p) => visible.has(p.id)) : filtered;
    const sorted = [...rows].sort((a, b) => {
      if (userPos) return (distances.get(a.id) ?? 0) - (distances.get(b.id) ?? 0);
      return b.score - a.score;
    });
    return sorted.slice(0, 100);
  }, [filtered, visibleIds, userPos, distances]);

  const wishes = useMemo(
    () => new Set(Object.entries(records).filter(([, r]) => r.wish).map(([id]) => id)),
    [records],
  );

  const selected = selectedId ? (places.find((p) => p.id === selectedId) ?? null) : null;

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

  return (
    <div className="app">
      <MapView
        places={filtered}
        selectedId={selectedId}
        userPos={userPos}
        focus={focus}
        onSelect={handleSelect}
        onVisibleChange={setVisibleIds}
      />

      <header className="topbar">
        <Filters
          categories={categories}
          tags={tags}
          availableTags={availableTags}
          query={query}
          onlyWish={onlyWish}
          onToggleCategory={(c) => setCategories((s) => toggle(s, c))}
          onToggleTag={(t) => setTags((s) => toggle(s, t))}
          onQueryChange={setQuery}
          onToggleWish={() => setOnlyWish((v) => !v)}
          onLocate={handleLocate}
          locating={locating}
        />
      </header>

      <section className={`sheet ${expanded ? 'expanded' : ''}`}>
        <button
          className="sheet-handle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="grip" />
          <span className="sheet-count">
            {data ? `이 지역 ${listed.length}곳` : '불러오는 중…'}
          </span>
        </button>
        <div className="sheet-body">
          <PlaceList
            places={listed}
            distances={distances}
            wishes={wishes}
            total={places.length}
            onSelect={(id) => {
              handleSelect(id);
              setExpanded(false);
            }}
          />
        </div>
      </section>

      {selected && (
        <>
          <div className="scrim" onClick={() => setSelectedId(null)} />
          <PlaceDetail
            place={selected}
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
          />
        </>
      )}
    </div>
  );
}
