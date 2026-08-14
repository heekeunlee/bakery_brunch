import { CATEGORY_LABEL, type Category } from '../types';

type Props = {
  categories: Set<Category>;
  tags: Set<string>;
  availableTags: string[];
  query: string;
  onToggleCategory: (c: Category) => void;
  onToggleTag: (t: string) => void;
  onQueryChange: (q: string) => void;
  onLocate: () => void;
  locating: boolean;
  onFind: () => void;
  finding: boolean;
  findError: string | null;
  showChains: boolean;
  onToggleChains: () => void;
};

const CATEGORIES: Category[] = ['bakery', 'brunch', 'cafe', 'dessert'];

export default function Filters({
  categories,
  tags,
  availableTags,
  query,
  onToggleCategory,
  onToggleTag,
  onQueryChange,
  onLocate,
  locating,
  onFind,
  finding,
  findError,
  showChains,
  onToggleChains,
}: Props) {
  return (
    <div className="filters">
      <div className="filters-row search-row">
        <input
          className="search"
          type="search"
          inputMode="search"
          placeholder="지역 · 가게 검색 (읍·면·리까지)"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          // 엔터도 '찾기'와 같게 — 모바일 키보드에서 버튼을 다시 누르지 않아도 되도록.
          onKeyDown={(e) => {
            if (e.key === 'Enter') onFind();
          }}
        />
        <button
          className={`find ${finding ? 'busy' : ''}`}
          onClick={onFind}
          disabled={finding || !query.trim()}
        >
          {finding ? '…' : '찾기'}
        </button>
        <button
          className={`locate ${locating ? 'busy' : ''}`}
          onClick={onLocate}
          aria-label="현재 위치로 이동"
          title="현재 위치로 이동"
        >
          ◎
        </button>
      </div>

      {findError && <p className="find-error">{findError}</p>}

      <div className="filters-row chips scroll" role="group" aria-label="필터">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`chip cat-${c} ${categories.has(c) ? 'on' : ''}`}
            aria-pressed={categories.has(c)}
            onClick={() => onToggleCategory(c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
        <button
          className={`chip starbucks ${showChains ? 'on' : ''}`}
          aria-pressed={showChains}
          onClick={onToggleChains}
        >
          ☕ 스타벅스
        </button>
        <span className="chip-sep" />
        {availableTags.map((t) => (
          <button
            key={t}
            className={`chip tag ${tags.has(t) ? 'on' : ''}`}
            aria-pressed={tags.has(t)}
            onClick={() => onToggleTag(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
