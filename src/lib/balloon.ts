import { CATEGORY_LABEL, type Place, type PlaceDetails } from '../types';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

/**
 * 마커에 마우스를 올렸을 때 뜨는 풍선. 카카오 CustomOverlay 는 DOM 이나 HTML
 * 문자열만 받으므로 리액트 밖에서 직접 만든다. 값이 전부 데이터에서 오므로
 * 넣기 전에 반드시 이스케이프한다.
 *
 * 여기서는 "들어갈까 말까"를 정할 만큼만 보여준다 — 사진, 평판, 대표 메뉴 두 개,
 * 편의시설. 나머지는 클릭해서 여는 상세에 있다.
 */
export function balloonHtml(place: Place, detail?: PlaceDetails): string {
  const cats = place.category.map((c) => CATEGORY_LABEL[c]).join(' · ');

  const photo = detail?.photo
    ? `<div class="bl-photo"><img src="${esc(detail.photo.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"
         onerror="this.parentNode.style.display='none'"></div>`
    : '';

  const menus = detail?.menus?.length
    ? `<ul class="bl-menus">${detail.menus
        .slice(0, 3)
        .map((m) => `<li><span>${esc(m.name)}</span><b>${won(m.price)}</b></li>`)
        .join('')}</ul>`
    : '';

  const f = detail?.facility;
  const facs: string[] = [];
  if (f) {
    if (f.parkingHint === 'yes' || f.parkingNearby > 0) facs.push('P 주차');
    else if (f.parkingHint === 'hard') facs.push('P 주차 어려움');
    if (f.evNearby > 0) facs.push('⚡ 충전');
    if (f.kids === 'ok') facs.push('👶 아이 동반');
    else if (f.kids === 'no') facs.push('👶 노키즈존');
  }
  const facility = facs.length
    ? `<div class="bl-fac">${facs.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`
    : '';

  const tags = place.tags.length
    ? `<div class="bl-tags">${place.tags
        .slice(0, 3)
        .map((t) => `<span>${esc(t)}</span>`)
        .join('')}</div>`
    : '';

  return `
    <div class="balloon">
      ${photo}
      <div class="bl-body">
        <div class="bl-head">
          <strong>${esc(place.name)}</strong>
          <span class="bl-score">${place.score.toFixed(0)}</span>
        </div>
        <p class="bl-sub">${esc(`${place.region.sigungu} · ${cats}`)}</p>
        ${tags}
        ${menus}
        ${facility}
        <p class="bl-more">클릭하면 사진 · 메뉴 · 후기까지</p>
      </div>
    </div>`;
}
