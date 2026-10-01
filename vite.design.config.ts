import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const project = fileURLToPath(new URL('.', import.meta.url))
const version = JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8')).version
let out = resolve(project, 'dist-design')

// Отдельный вход: ни плагина PWA, ни импорта рабочего приложения.
export default defineConfig({
  root: 'design',
  base: process.env.BASE_PATH ?? './',
  plugins: [react(), {
    name: 'offline-shell', apply: 'build',
    configResolved(config) { out = resolve(config.root, config.build.outDir) },
    closeBundle() {
      const files = readdirSync(out, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name !== 'sw.js')
        .map(entry => resolve(entry.parentPath, entry.name).slice(out.length + 1))
        .sort()
      const template = readFileSync(resolve(project, 'design/public/sw.js'), 'utf8')
      // Разные сборки одной версии не смешивают HTML и хешированные assets.
      const hash = createHash('sha256').update(template).update(version)
      for (const file of files) hash.update(file).update(readFileSync(resolve(out, file)))
      const worker = template
        .replace("'dev' /*__VERSION__*/", JSON.stringify(version))
        .replace("'dev' /*__BUILD__*/", JSON.stringify(hash.digest('hex').slice(0, 16)))
        .replace('[] /*__PRECACHE__*/', JSON.stringify(files))
      writeFileSync(resolve(out, 'sw.js'), worker)
    },
  }],
  server: { host: '127.0.0.1', port: 4175, strictPort: true, proxy: { '/agent': 'http://127.0.0.1:4176' } },
  build: { outDir: '../dist-design', emptyOutDir: true },
})
