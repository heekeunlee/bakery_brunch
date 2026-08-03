/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    kakao: any;
  }
}

let pending: Promise<any> | null = null;

/**
 * 카카오맵 SDK 를 한 번만 로드한다.
 * autoload=false 로 받아온 뒤 kakao.maps.load 로 실제 초기화를 기다려야
 * clusterer 같은 라이브러리까지 준비된 상태가 보장된다.
 */
export function loadKakao(): Promise<any> {
  if (pending) return pending;

  const key = import.meta.env.VITE_KAKAO_JS_KEY;
  if (!key) {
    return Promise.reject(
      new Error(
        'VITE_KAKAO_JS_KEY 가 설정되지 않았습니다. ' +
          '.env.local 에 키를 넣거나 GitHub Secrets 에 등록하세요.',
      ),
    );
  }

  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src =
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}` +
      `&libraries=clusterer&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    script.onerror = () =>
      reject(new Error('카카오맵 SDK 로드 실패 — 앱 키의 도메인 설정을 확인하세요.'));
    document.head.appendChild(script);
  });

  return pending;
}
