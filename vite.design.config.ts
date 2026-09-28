import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = fileURLToPath(new URL('.', import.meta.url))
const version = JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8')).version

// Отдельный вход: ни плагина PWA, ни импорта рабочего приложения.
export default defineConfig({
  root: 'design',
  base: process.env.BASE_PATH ?? './',
  plugins: [react(), {
    name: 'offline-shell', apply: 'build',
    closeBundle() {
      const out = resolve(project, 'dist-design')
      const files = readdirSync(out, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name !== 'sw.js')
        .map(entry => resolve(entry.parentPath, entry.name).slice(out.length + 1))
      const worker = readFileSync(resolve(project, 'design/public/sw.js'), 'utf8')
        .replace("'dev' /*__VERSION__*/", JSON.stringify(version))
        .replace('[] /*__PRECACHE__*/', JSON.stringify(files))
      writeFileSync(resolve(out, 'sw.js'), worker)
    },
  }],
  server: { host: '127.0.0.1', port: 4175, strictPort: true, proxy: { '/agent': 'http://127.0.0.1:4176' } },
  build: { outDir: '../dist-design', emptyOutDir: true },
})
