/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadKakao } from './kakaoLoader';

export type GeoHit = { lat: number; lng: number; name: string };

/**
 * 지역 이름을 좌표로 바꾼다. "강릉시", "주문진읍", "성수동"처럼
 * 지자체명부터 읍·면·동·리까지 받는다.
 *
 * 주소 검색을 먼저 쓰고, 여기서 안 잡히는 통칭(법정동이 아닌 동네 이름,
 * "을왕리해수욕장" 같은 표기)은 장소 검색으로 한 번 더 시도한다.
 */
export async function searchRegion(query: string): Promise<GeoHit | null> {
  const kakao = await loadKakao();
  const svc = kakao.maps.services;

  const byAddress = await new Promise<GeoHit | null>((resolve) => {
    new svc.Geocoder().addressSearch(query, (res: any[], status: string) => {
      if (status !== svc.Status.OK || !res?.length) return resolve(null);
      const r = res[0];
      resolve({ lat: Number(r.y), lng: Number(r.x), name: r.address_name });
    });
  });
  if (byAddress) return byAddress;

  return new Promise((resolve) => {
    new svc.Places().keywordSearch(query, (res: any[], status: string) => {
      if (status !== svc.Status.OK || !res?.length) return resolve(null);
      const r = res[0];
      resolve({
        lat: Number(r.y),
        lng: Number(r.x),
        name: r.address_name || r.place_name,
      });
    });
  });
}
