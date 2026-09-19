import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Отдельный вход: ни плагина PWA, ни импорта рабочего приложения.
export default defineConfig({
  root: 'design',
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
  build: { outDir: '../dist-design', emptyOutDir: true },
})
