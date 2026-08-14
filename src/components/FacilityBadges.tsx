import type { Facility } from '../types';

/**
 * 주차 · 전기차 충전 · 아이 동반을 한 줄로 보여준다.
 *
 * 주차장과 충전소는 카카오에서 받은 '반경 안에 몇 개'라 가게 전용 시설이 아니다.
 * 아이 동반은 블로그 본문에서 읽어낸 것이라 확실할 때만 말한다.
 * 근거가 약한 걸 단정해서 헛걸음시키느니 아무 말도 안 하는 편이 낫다.
 */
export default function FacilityBadges({
  facility,
  compact = false,
}: {
  facility: Facility;
  compact?: boolean;
}) {
  const items: { key: string; icon: string; label: string; tone: string }[] = [];

  if (facility.parkingHint === 'yes' || facility.parkingNearby > 0) {
    items.push({
      key: 'parking',
      icon: 'P',
      tone: 'ok',
      label:
        facility.parkingHint === 'yes'
          ? '주차'
          : `주차장 ${facility.parkingNearby}곳`,
    });
  } else if (facility.parkingHint === 'hard') {
    items.push({ key: 'parking', icon: 'P', tone: 'warn', label: '주차 어려움' });
  }

  if (facility.evNearby > 0) {
    items.push({ key: 'ev', icon: '⚡', tone: 'ok', label: '전기차 충전' });
  }

  if (facility.kids === 'ok') {
    items.push({ key: 'kids', icon: '👶', tone: 'ok', label: '아이 동반' });
  } else if (facility.kids === 'no') {
    items.push({ key: 'kids', icon: '👶', tone: 'warn', label: '노키즈존' });
  }

  if (!items.length) return null;

  return (
    <div className={`facilities ${compact ? 'compact' : ''}`}>
      {items.map((it) => (
        <span key={it.key} className={`fac ${it.tone}`}>
          <span className="fac-icon">{it.icon}</span>
          {it.label}
        </span>
      ))}
    </div>
  );
}
