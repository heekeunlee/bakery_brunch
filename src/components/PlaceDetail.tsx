import { useState } from 'react';
import { CATEGORY_LABEL, type Place, type PlaceDetails, type UserRecord } from '../types';
import { distanceKm, formatDistance } from '../lib/geo';
import FacilityBadges from './FacilityBadges';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

type Props = {
  place: Place;
  detail: PlaceDetails | undefined;
  nearby: Place[];
  distanceKm: number | null;
  record: UserRecord | undefined;
  onClose: () => void;
  onToggleWish: () => void;
  onRate: (rating: number) => void;
  onSelect: (id: string) => void;
};

/** 카카오맵 길찾기 딥링크. 앱이 있으면 앱으로, 없으면 웹으로 열린다. */
function routeUrl(p: Place) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}`;
}

export default function PlaceDetail({
  place,
  detail,
  nearby,
  distanceKm: distFromMe,
  record,
  onClose,
  onToggleWish,
  onRate,
  onSelect,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);
  const visited = record?.visited;

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  const shareUrl = `${location.origin}${location.pathname}?place=${place.id}`;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: place.name, url: shareUrl });
        return;
      } catch {
        return; // 사용자가 공유 시트를 닫은 경우
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash('링크를 복사했습니다');
    } catch {
      flash('복사에 실패했습니다');
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(place.address);
      flash('주소를 복사했습니다');
    } catch {
      flash('복사에 실패했습니다');
    }
  };

  return (
    <div className="detail">
      <div className="detail-grip" />

      {detail?.photo && (
        <figure className="detail-photo">
          <img
            src={detail.photo.thumb}
            alt=""
            loading="lazy"
            // 네이버 썸네일은 referer 를 보고 막는 경우가 있다. 도메인이 바뀌어도
            // 깨지지 않도록 referer 를 아예 안 보낸다.
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget.closest('figure') as HTMLElement).style.display = 'none';
            }}
          />
          <figcaption>네이버 이미지 검색 · {detail.photo.title}</figcaption>
        </figure>
      )}

      <div className="detail-head">
        <div>
          <h2>{place.name}</h2>
          <p className="detail-sub">
            {place.category.map((c) => CATEGORY_LABEL[c]).join(' · ')}
            {distFromMe != null && <> · 내 위치에서 {formatDistance(distFromMe)}</>}
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

      {detail?.facility && <FacilityBadges facility={detail.facility} />}

      <div className="quick-actions">
        <a className="qa" href={routeUrl(place)} target="_blank" rel="noreferrer">
          <span className="qa-icon">↗</span>길찾기
        </a>
        {place.phone ? (
          <a className="qa" href={`tel:${place.phone}`}>
            <span className="qa-icon">☎</span>전화
          </a>
        ) : (
          <span className="qa disabled">
            <span className="qa-icon">☎</span>전화
          </span>
        )}
        <button className="qa" onClick={copyAddress}>
          <span className="qa-icon">⧉</span>주소복사
        </button>
        <button className="qa" onClick={share}>
          <span className="qa-icon">↑</span>공유
        </button>
      </div>

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
      </dl>

      {detail && detail.menus.length > 0 && (
        <section className="detail-block">
          <h3>대표 메뉴</h3>
          <ul className="menu-list">
            {detail.menus.map((m) => (
              <li key={`${m.name}-${m.price}`}>
                <span>{m.name}</span>
                <b>{won(m.price)}</b>
              </li>
            ))}
          </ul>
          <p className="unverified">
            블로그 후기에서 모은 값이라 실제 가격과 다를 수 있습니다.
          </p>
        </section>
      )}

      {detail && detail.blogs.length > 0 && (
        <section className="detail-block">
          <h3>손님 후기</h3>
          <ul className="blog-list">
            {detail.blogs.map((b) => (
              <li key={b.link}>
                <a href={b.link} target="_blank" rel="noreferrer">
                  <span className="blog-title">{b.title}</span>
                  <span className="blog-meta">
                    {b.blogger} · {b.date}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail?.facility && (detail.facility.parkingNearest || detail.facility.evNearest) && (
        <section className="detail-block">
          <h3>주변 시설</h3>
          <dl className="detail-info">
            {detail.facility.parkingNearest && (
              <>
                <dt>주차장</dt>
                <dd>
                  {detail.facility.parkingNearest.name} ·{' '}
                  {detail.facility.parkingNearest.distance}m
                  {detail.facility.parkingNearby > 1 &&
                    ` (300m 안에 ${detail.facility.parkingNearby}곳)`}
                </dd>
              </>
            )}
            {detail.facility.evNearest && (
              <>
                <dt>전기차 충전</dt>
                <dd>
                  {detail.facility.evNearest.name} · {detail.facility.evNearest.distance}m
                  {detail.facility.evNearby > 1 &&
                    ` (700m 안에 ${detail.facility.evNearby}곳)`}
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      <div className="detail-actions">
        <a className="btn primary" href={place.placeUrl} target="_blank" rel="noreferrer">
          카카오맵에서 자세히 보기
        </a>
        <button
          className={`btn wishbtn ${record?.wish ? 'on' : ''}`}
          onClick={onToggleWish}
          aria-pressed={!!record?.wish}
        >
          {record?.wish ? '♥ 저장됨' : '♡ 저장'}
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

      {nearby.length > 0 && (
        <div className="nearby">
          <h3>주변에 이런 곳도</h3>
          <ul>
            {nearby.map((n) => (
              <li key={n.id}>
                <button onClick={() => onSelect(n.id)}>
                  <span className="nearby-name">{n.name}</span>
                  <span className="nearby-meta">
                    {formatDistance(distanceKm(place, n))} · 평판 {n.score.toFixed(0)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="disclaimer">
        영업시간 · 휴무 · 메뉴 가격은 블로그 본문에서 자동으로 뽑은 값이라 실제와 다를
        수 있습니다. 주차장 · 전기차 충전소는 가게 전용 시설이 아니라 주변 반경 안에
        있는 곳입니다. 방문 전 카카오맵에서 확인하세요.
      </p>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
