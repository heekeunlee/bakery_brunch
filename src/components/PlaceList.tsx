import { CATEGORY_LABEL, type Place } from '../types';
import { formatDistance } from '../lib/geo';

type Props = {
  places: Place[];
  distances: Map<string, number>;
  wishes: Set<string>;
  total: number;
  onSelect: (id: string) => void;
};

/** 신규 배지: 최근 14일 안에 처음 발견된 가게. */
function isNew(place: Place): boolean {
  const days = (Date.now() - new Date(place.firstSeen).getTime()) / 86_400_000;
  return days <= 14;
}

export default function PlaceList({ places, distances, wishes, total, onSelect }: Props) {
  if (total === 0) {
    return (
      <div className="empty">
        <p>아직 수집된 데이터가 없습니다.</p>
        <p className="muted">
          매일 아침 자동 수집이 돌면서 채워집니다. 수동 실행은 <code>npm run collect</code>.
        </p>
      </div>
    );
  }

  if (places.length === 0) {
    return (
      <div className="empty">
        <p>이 화면에는 조건에 맞는 곳이 없어요.</p>
        <p className="muted">지도를 움직이거나 필터를 풀어보세요.</p>
      </div>
    );
  }

  return (
    <ul className="place-list">
      {places.map((p) => {
        const d = distances.get(p.id);
        return (
          <li key={p.id}>
            <button className="place-row" onClick={() => onSelect(p.id)}>
              <span
                className="row-bar"
                style={{ ['--cat' as string]: `var(--cat-${p.category[0] ?? 'cafe'})` }}
              />
              <span className="row-main">
                <span className="row-title">
                  {p.name}
                  {isNew(p) && <span className="badge-new">NEW</span>}
                  {wishes.has(p.id) && <span className="badge-wish">♥</span>}
                </span>
                <span className="row-sub">
                  {p.region.sigungu} · {p.category.map((c) => CATEGORY_LABEL[c]).join('·')}
                  {p.tags.slice(0, 2).map((t) => (
                    <span key={t} className="row-tag">
                      {t}
                    </span>
                  ))}
                </span>
              </span>
              <span className="row-right">
                <span className="row-score">{p.score.toFixed(0)}</span>
                {d != null && <span className="row-dist">{formatDistance(d)}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
