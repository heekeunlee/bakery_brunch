import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages 프로젝트 사이트는 /<repo>/ 하위에 배포된다.
// 로컬 dev 에서는 루트로 두어야 편하므로 환경변수로 분기한다.
const base = process.env.GITHUB_ACTIONS ? '/bakery_brunch/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '빵집지도 — 전국 베이커리 · 브런치 카페',
        short_name: '빵집지도',
        description: '여행지 주변의 평판 좋은 베이커리 카페와 브런치 카페를 찾아보세요.',
        theme_color: '#8b5e34',
        background_color: '#fdfaf6',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        // places.json 은 매일 커지는 수 MB 짜리 데이터라 프리캐시에 넣지 않는다.
        // 넣으면 (1) 워크박스 2MiB 한도에 걸려 빌드가 실패하고,
        // (2) 데이터가 바뀔 때마다 서비스워커 전체가 갱신되어 앱을 통째로 다시 받는다.
        // 대신 아래 runtimeCaching 으로 받아 두어 오프라인에서도 열린다.
        globIgnores: ['**/data/places.json'],
        runtimeCaching: [
          {
            // 데이터는 항상 최신을 먼저 시도하고, 오프라인이면 마지막으로 받은 것을 쓴다.
            urlPattern: ({ url }) => url.pathname.endsWith('/data/places.json'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'places-data',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 지도 타일과 SDK 는 네트워크 우선, 실패 시 캐시로 폴백.
            urlPattern: /^https:\/\/(dapi|t1|map)\.(kakao|daumcdn)\.(com|net)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kakao-map',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
        ],
      },
    }),
  ],
});
