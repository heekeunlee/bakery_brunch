import { CATEGORY_LABEL, type Category } from '../types';

type Props = {
  categories: Set<Category>;
  tags: Set<string>;
  availableTags: string[];
  query: string;
  onlyWish: boolean;
  onToggleCategory: (c: Category) => void;
  onToggleTag: (t: string) => void;
  onQueryChange: (q: string) => void;
  onToggleWish: () => void;
  onLocate: () => void;
  locating: boolean;
};

const CATEGORIES: Category[] = ['bakery', 'brunch', 'cafe', 'dessert'];

export default function Filters({
  categories,
  tags,
  availableTags,
  query,
  onlyWish,
  onToggleCategory,
  onToggleTag,
  onQueryChange,
  onToggleWish,
  onLocate,
  locating,
}: Props) {
  return (
    <div className="filters">
      <div className="filters-row search-row">
        <input
          className="search"
          type="search"
          inputMode="search"
          placeholder="가게 · 지역 검색"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <button
          className={`locate ${locating ? 'busy' : ''}`}
          onClick={onLocate}
          aria-label="현재 위치로 이동"
          title="현재 위치로 이동"
        >
          ◎
        </button>
      </div>

      <div className="filters-row chips" role="group" aria-label="카테고리 필터">
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
          className={`chip wish ${onlyWish ? 'on' : ''}`}
          aria-pressed={onlyWish}
          onClick={onToggleWish}
        >
          ♥ 위시
        </button>
      </div>

      {availableTags.length > 0 && (
        <div className="filters-row chips scroll" role="group" aria-label="태그 필터">
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
      )}
    </div>
  );
}
