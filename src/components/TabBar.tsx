export type Tab = 'map' | 'list' | 'region' | 'saved';

type Props = {
  tab: Tab;
  savedCount: number;
  onChange: (tab: Tab) => void;
};

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map', label: '지도', icon: '◎' },
  { id: 'list', label: '목록', icon: '☰' },
  { id: 'region', label: '지역', icon: '⬢' },
  { id: 'saved', label: '저장', icon: '♥' },
];

export default function TabBar({ tab, savedCount, onChange }: Props) {
  return (
    <nav className="tabbar" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          className={`tabbtn ${tab === t.id ? 'on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="tabicon">
            {t.icon}
            {t.id === 'saved' && savedCount > 0 && (
              <span className="tabbadge">{savedCount > 99 ? '99+' : savedCount}</span>
            )}
          </span>
          <span className="tablabel">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
