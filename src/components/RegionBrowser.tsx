import { useMemo, useState } from 'react';
import type { Place } from '../types';

type Props = {
  places: Place[];
  onPick: (sido: string, sigungu: string) => void;
};

/**
 * 시도 → 시군구 드릴다운.
 * 여행 계획 단계에서 "이번에 강릉 가는데 어디 갈까"를 미리 훑는 용도라,
 * 지도가 아니라 목록으로 지역을 고르게 한다.
 */
export default function RegionBrowser({ places, onPick }: Props) {
  const [openSido, setOpenSido] = useState<string | null>(null);

  const tree = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const p of places) {
      const { sido, sigungu } = p.region;
      if (!map.has(sido)) map.set(sido, new Map());
      const inner = map.get(sido)!;
      inner.set(sigungu, (inner.get(sigungu) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([sido, inner]) => ({
        sido,
        total: [...inner.values()].reduce((a, b) => a + b, 0),
        children: [...inner.entries()]
          .map(([sigungu, count]) => ({ sigungu, count }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);
  }, [places]);

  if (!tree.length) {
    return (
      <div className="empty">
        <p>아직 수집된 지역이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="region-browser">
      {tree.map((node) => {
        const open = openSido === node.sido;
        return (
          <div key={node.sido} className="region-group">
            <button
              className={`region-sido ${open ? 'on' : ''}`}
              onClick={() => setOpenSido(open ? null : node.sido)}
              aria-expanded={open}
            >
              <span className="region-name">{node.sido}</span>
              <span className="region-count">{node.total}</span>
              <span className={`region-caret ${open ? 'on' : ''}`}>›</span>
            </button>
            {open && (
              <ul className="region-children">
                {node.children.map((c) => (
                  <li key={c.sigungu}>
                    <button
                      className="region-sigungu"
                      onClick={() => onPick(node.sido, c.sigungu)}
                    >
                      <span>{c.sigungu}</span>
                      <span className="region-count">{c.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
