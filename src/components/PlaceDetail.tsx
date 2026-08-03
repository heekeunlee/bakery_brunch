import { CATEGORY_LABEL, type Place, type UserRecord } from '../types';
import { formatDistance } from '../lib/geo';

type Props = {
  place: Place;
  distanceKm: number | null;
  record: UserRecord | undefined;
  onClose: () => void;
  onToggleWish: () => void;
  onRate: (rating: number) => void;
};

export default function PlaceDetail({
  place,
  distanceKm,
  record,
  onClose,
  onToggleWish,
  onRate,
}: Props) {
  const visited = record?.visited;

  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <h2>{place.name}</h2>
          <p className="detail-sub">
            {place.category.map((c) => CATEGORY_LABEL[c]).join(' · ')}
            {distanceKm != null && <> · {formatDistance(distanceKm)}</>}
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      <div className="detail-meta">
        <span className="score-pill">평판 {place.score.toFixed(0)}</span>
        <span className="muted">블로그 {place.mentions}회 언급</span>
      </div>

      {place.tags.length > 0 && (
        <div className="detail-tags">
          {place.tags.map((t) => (
            <span key={t} className="tag-pill">
              {t}
            </span>
          ))}
        </div>
      )}

      <dl className="detail-info">
        <dt>주소</dt>
        <dd>{place.address}</dd>
        {place.hours && (
          <>
            <dt>영업시간</dt>
            <dd>
              {place.hours} <span className="unverified">블로그 기준</span>
            </dd>
          </>
        )}
        {place.closedDay && (
          <>
            <dt>휴무</dt>
            <dd>
              {place.closedDay} <span className="unverified">블로그 기준</span>
            </dd>
          </>
        )}
        {place.phone && (
          <>
            <dt>전화</dt>
            <dd>
              <a href={`tel:${place.phone}`}>{place.phone}</a>
            </dd>
          </>
        )}
      </dl>

      <div className="detail-actions">
        <a className="btn primary" href={place.placeUrl} target="_blank" rel="noreferrer">
          카카오맵에서 열기
        </a>
        <button className={`btn ${record?.wish ? 'on' : ''}`} onClick={onToggleWish}>
          {record?.wish ? '♥ 위시' : '♡ 위시'}
        </button>
      </div>

      <div className="rating">
        <span className="rating-label">내 평가</span>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`star ${visited && visited.rating >= n ? 'on' : ''}`}
              onClick={() => onRate(n)}
              aria-label={`${n}점`}
            >
              ★
            </button>
          ))}
          {visited && <span className="muted">{visited.date} 방문</span>}
        </div>
      </div>

      <p className="disclaimer">
        영업시간 · 휴무는 블로그 본문에서 자동 추출한 값이라 실제와 다를 수 있습니다.
        방문 전 카카오맵에서 확인하세요.
      </p>
    </div>
  );
}
