import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const built = new Date().toLocaleString('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

// BASE_PATH задаётся при деплое (для GitHub Pages это '/<имя-репозитория>/').
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(built),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Регистрируем сами в main.tsx: iOS не проверяет обновления без пинка.
      injectRegister: null,
      includeAssets: ['icon-180.png'],
      manifest: {
        name: 'ДЗ',
        short_name: 'ДЗ',
        description: 'Домашние задания с учётом числителя и знаменателя',
        lang: 'ru',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        // Цвета заставки при запуске с иконки — под светлую тему «Тихий».
        background_color: '#e9ebee',
        theme_color: '#e9ebee',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        // Шрифты лежат на Google Fonts, поэтому кешируем их отдельно — иначе
        // офлайн приложение откатится на системный шрифт.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
