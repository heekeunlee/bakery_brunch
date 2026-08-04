import { useState } from 'react';
import PlaceList from './PlaceList';
import type { Place, UserRecord } from '../types';

type Props = {
  places: Place[];
  records: Record<string, UserRecord>;
  distances: Map<string, number>;
  onSelect: (id: string) => void;
};

export default function SavedView({ places, records, distances, onSelect }: Props) {
  const [mode, setMode] = useState<'wish' | 'visited'>('wish');

  const wish = places.filter((p) => records[p.id]?.wish);
  const visited = places
    .filter((p) => records[p.id]?.visited)
    .sort(
      (a, b) =>
        (records[b.id].visited?.rating ?? 0) - (records[a.id].visited?.rating ?? 0),
    );
  const rows = mode === 'wish' ? wish : visited;

  return (
    <div className="saved">
      <div className="segment">
        <button className={mode === 'wish' ? 'on' : ''} onClick={() => setMode('wish')}>
          가고 싶은 곳 {wish.length}
        </button>
        <button
          className={mode === 'visited' ? 'on' : ''}
          onClick={() => setMode('visited')}
        >
          가본 곳 {visited.length}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p>{mode === 'wish' ? '저장한 곳이 없습니다.' : '기록한 방문이 없습니다.'}</p>
          <p className="muted">
            {mode === 'wish'
              ? '가게 상세에서 ♡ 를 누르면 여기에 모입니다.'
              : '가게 상세에서 별점을 매기면 여기에 남습니다.'}
          </p>
        </div>
      ) : (
        <PlaceList
          places={rows}
          distances={distances}
          wishes={new Set(wish.map((p) => p.id))}
          records={records}
          total={places.length}
          onSelect={onSelect}
          showRegion
        />
      )}
    </div>
  );
}
