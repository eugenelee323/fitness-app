import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/fitness-app/',
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt', includeAssets: ['icons/*.png'],
    manifest: {
      id: '/fitness-app/', name: '12週增肌', short_name: '12週增肌', lang: 'zh-Hant',
      description: '12 週智慧健身訓練與營養管理',
      start_url: '/fitness-app/', scope: '/fitness-app/', display: 'standalone',
      background_color: '#f4f6f1', theme_color: '#174b40',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'], navigateFallback: '/fitness-app/index.html', cleanupOutdatedCaches: true },
  })],
  test: { environment: 'node', setupFiles: ['./src/test/setup.ts'], exclude: ['node_modules/**', 'dist/**', 'e2e/**'] },
})
