import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Меняется только временный checkout для публикации, не исходники main.
const directory = resolve(process.argv[2] ?? 'legacy')
const base = process.env.LEGACY_BASE ?? '/DZ/'
const child = `${base}codex/`
const file = resolve(directory, 'vite.config.ts')
let source = readFileSync(file, 'utf8')
if (!source.includes('workbox: {') || !/cleanupOutdatedCaches:\s*true/.test(source)) {
  throw new Error('Конфигурация прежней PWA изменилась. Проверь совместимость перед публикацией.')
}
const deny = `^${child.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|$)`
source = source.replace(/cleanupOutdatedCaches:\s*true/, 'cleanupOutdatedCaches: false')
source = source.replace('workbox: {', `workbox: {\n        navigateFallbackDenylist: [new RegExp(${JSON.stringify(deny)})],\n        importScripts: [${JSON.stringify(`${base}codex-bridge.js`)}],`)
writeFileSync(file, source)
writeFileSync(resolve(directory, 'public/codex-bridge.js'), `// Освобождаем новый адрес от старого app-shell только у клиентов старого worker.\nself.addEventListener('activate', event => {\n  event.waitUntil((async () => {\n    await self.clients.claim();\n    const windows = await self.clients.matchAll({ type: 'window' });\n    await Promise.allSettled(windows.filter(client => new URL(client.url).pathname.startsWith(${JSON.stringify(child)})).map(client => client.navigate(client.url)));\n  })());\n});\n`)
console.log('Совместимость прежней PWA со второй ссылкой подготовлена.')
