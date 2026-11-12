import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const darkBg=readFileSync(new URL('./src/style.css',import.meta.url),'utf8').match(/--bg:(#[A-Fa-f0-9]+)/)![1]
export default defineConfig({
  base: '/fitness-app/',
  plugins: [{name:'theme-meta',transformIndexHtml(html){return html.replace('%APP_THEME_COLOR%',darkBg)}},react(), tailwindcss(), VitePWA({
    registerType: 'prompt', includeAssets: ['icons/*.png'],
    manifest: {
      id: '/fitness-app/', name: '12週增肌', short_name: '12週增肌', lang: 'zh-Hant',
      description: '12 週智慧健身訓練與營養管理',
      start_url: '/fitness-app/', scope: '/fitness-app/', display: 'standalone',
      background_color: darkBg, theme_color: darkBg,
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'], navigateFallback: '/fitness-app/index.html', cleanupOutdatedCaches: true },
  })],
  test: { testTimeout: 15000, coverage: { provider: 'v8', include: ['src/lib/rules/**/*.ts'], exclude: ['src/lib/rules/**/*.test.ts'], reporter: ['text', 'json-summary', 'html'], thresholds: { perFile: true, lines: 90, statements: 90, functions: 90, branches: 90 } }, environment: 'node', setupFiles: ['./src/test/setup.ts'], exclude: ['node_modules/**', 'dist/**', 'e2e/**'] },
})
