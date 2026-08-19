import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest, KHÔNG phải generateSW: Web Push cần handler `push` và
      // `notificationclick` riêng, generateSW không cho chèn code vào.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Sổ cá nhân',
        short_name: 'Sổ',
        description: 'Theo dõi sức khoẻ và việc cần làm hằng ngày',
        theme_color: '#191A17',
        background_color: '#191A17',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'] },
      // Mặc định `pnpm dev` KHÔNG đăng ký service worker, nên nút bật Nhắc
      // không làm gì được và mọi thứ chạm tới serviceWorker đều treo. Bật lên
      // để thử thông báo ngay ở dev thay vì phải build rồi preview.
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
  server: { host: true },
})
