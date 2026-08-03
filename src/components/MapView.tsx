/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { loadKakao } from '../lib/kakaoLoader';
import { CATEGORY_COLOR, type Place } from '../types';
import type { LatLng } from '../lib/geo';

type Props = {
  places: Place[];
  selectedId: string | null;
  userPos: LatLng | null;
  focus: LatLng | null;
  onSelect: (id: string) => void;
  onVisibleChange: (ids: string[]) => void;
};

/** 카테고리 색을 입힌 핀. 클러스터러가 Marker 만 받으므로 CustomOverlay 대신 SVG 이미지를 쓴다. */
function pinImage(kakao: any, color: string, active: boolean) {
  const w = active ? 34 : 26;
  const h = active ? 44 : 34;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 26 34">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.4 11.3 20 12.2 20.8a1.2 1.2 0 0 0 1.6 0C14.7 33 26 22.4 26 13 26 5.8 20.2 0 13 0z" fill="${color}"/>
    <circle cx="13" cy="13" r="5" fill="#fff" opacity="${active ? 1 : 0.85}"/>
  </svg>`;
  return new kakao.maps.MarkerImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    new kakao.maps.Size(w, h),
    { offset: new kakao.maps.Point(w / 2, h) },
  );
}

export default function MapView({
  places,
  selectedId,
  userPos,
  focus,
  onSelect,
  onVisibleChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const kakaoRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const userMarkerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  // 지도 1회 생성
  useEffect(() => {
    let cancelled = false;
    loadKakao()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;
        kakaoRef.current = kakao;
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(37.5665, 126.978),
          level: 8,
        });
        mapRef.current = map;
        clustererRef.current = new kakao.maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: 7,
          disableClickZoom: false,
        });

        const report = () => {
          const bounds = map.getBounds();
          const ids: string[] = [];
          markersRef.current.forEach((marker, id) => {
            if (bounds.contain(marker.getPosition())) ids.push(id);
          });
          onVisibleChange(ids);
        };
        kakao.maps.event.addListener(map, 'idle', report);
      })
      .catch((err: Error) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
    // onVisibleChange 는 부모에서 useCallback 으로 고정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 마커 동기화
  useEffect(() => {
    const kakao = kakaoRef.current;
    const clusterer = clustererRef.current;
    if (!kakao || !clusterer) return;

    clusterer.clear();
    markersRef.current.clear();

    const markers = places.map((p) => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        title: p.name,
        image: pinImage(kakao, CATEGORY_COLOR[p.category[0] ?? 'cafe'], p.id === selectedId),
        zIndex: p.id === selectedId ? 10 : 1,
      });
      kakao.maps.event.addListener(marker, 'click', () => onSelect(p.id));
      markersRef.current.set(p.id, marker);
      return marker;
    });

    clusterer.addMarkers(markers);

    const map = mapRef.current;
    if (map) {
      const bounds = map.getBounds();
      const ids: string[] = [];
      markersRef.current.forEach((m, id) => {
        if (bounds.contain(m.getPosition())) ids.push(id);
      });
      onVisibleChange(ids);
    }
  }, [places, selectedId, onSelect, onVisibleChange]);

  // 내 위치 표시
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!kakao || !map || !userPos) return;

    userMarkerRef.current?.setMap(null);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="9" fill="#2d7ff9" opacity="0.25"/>
      <circle cx="11" cy="11" r="5" fill="#2d7ff9" stroke="#fff" stroke-width="2"/>
    </svg>`;
    userMarkerRef.current = new kakao.maps.Marker({
      map,
      position: new kakao.maps.LatLng(userPos.lat, userPos.lng),
      image: new kakao.maps.MarkerImage(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        new kakao.maps.Size(22, 22),
        { offset: new kakao.maps.Point(11, 11) },
      ),
      zIndex: 20,
    });
  }, [userPos]);

  // 외부에서 요청한 위치로 이동
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!kakao || !map || !focus) return;
    map.panTo(new kakao.maps.LatLng(focus.lat, focus.lng));
  }, [focus]);

  if (error) {
    return (
      <div className="map-error">
        <strong>지도를 불러오지 못했습니다</strong>
        <p>{error}</p>
      </div>
    );
  }

  return <div className="map" ref={containerRef} />;
}
