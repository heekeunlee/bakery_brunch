/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { loadKakao } from '../lib/kakaoLoader';
import { CATEGORY_COLOR, type Place } from '../types';
import { distanceKm, type FocusTarget, type LatLng } from '../lib/geo';

type Props = {
  places: Place[];
  selectedId: string | null;
  userPos: LatLng | null;
  focus: FocusTarget | null;
  onSelect: (id: string) => void;
  onVisibleChange: (ids: string[]) => void;
  /** 값이 바뀔 때마다 지금 화면 범위를 다시 훑는다. '재검색' 버튼이 올린다. */
  researchNonce: number;
  /** 지도 탭이 보이는 중인지. 숨겨진 동안 생긴 지도는 크기가 0이라 다시 잡아줘야 한다. */
  visible: boolean;
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
  researchNonce,
  visible,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const kakaoRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const userMarkerRef = useRef<any>(null);
  /** 화면 범위 보고 함수. 지도 생성 시 만들어 두고 '재검색'에서도 불러 쓴다. */
  const reportRef = useRef<(() => void) | null>(null);
  /** 마지막으로 요청받은 위치. relayout 후 중심을 다시 맞추는 데 쓴다. */
  const focusRef = useRef<FocusTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 지도 준비 여부는 ref 가 아니라 state 로 들고 있어야 한다.
  // ref 는 바뀌어도 리렌더가 안 나서, 데이터가 SDK 보다 먼저 도착하면
  // 마커 이펙트가 clusterer 가 없는 채로 한 번 돌고 다시는 실행되지 않는다.
  const [ready, setReady] = useState(false);

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
        reportRef.current = report;
        kakao.maps.event.addListener(map, 'idle', report);
        setReady(true);
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
  }, [ready, places, selectedId, onSelect, onVisibleChange]);

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
  }, [ready, userPos]);

  // 외부에서 요청한 위치로 이동
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!kakao || !map || !focus) return;

    focusRef.current = focus;
    if (focus.level != null) map.setLevel(focus.level);

    const target = new kakao.maps.LatLng(focus.lat, focus.lng);
    const c = map.getCenter();
    // panTo 는 먼 곳으로 갈 때 전국을 가로지르며 훑어서 느리고 어지럽다.
    // 다른 동네로 건너뛰는 수준이면 그냥 끊어서 옮긴다.
    const far = distanceKm({ lat: c.getLat(), lng: c.getLng() }, focus) > 20;
    if (far) map.setCenter(target);
    else map.panTo(target);
  }, [ready, focus]);

  /**
   * 탭을 옮겨도 지도 상태를 잃지 않으려고 숨겨서 마운트해 두는데,
   * 숨겨진 컨테이너는 크기가 0이라 그대로 두면 다시 켰을 때 타일도 마커도
   * 엉뚱하게 그려진다. 보이는 순간 크기를 다시 재고 중심을 잡아준다.
   */
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!ready || !map || !visible) return;
    map.relayout();
    const f = focusRef.current;
    if (f) map.setCenter(new kakao.maps.LatLng(f.lat, f.lng));
    reportRef.current?.();
  }, [ready, visible]);

  // 필터가 풀린 뒤 목록을 지금 화면 기준으로 다시 채운다.
  // 지도를 움직이지 않으면 idle 이 안 나서, 버튼을 눌러도 목록이 그대로다.
  useEffect(() => {
    if (!ready || !researchNonce) return;
    reportRef.current?.();
  }, [ready, researchNonce]);

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
