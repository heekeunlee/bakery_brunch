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
        runtimeCaching: [
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
