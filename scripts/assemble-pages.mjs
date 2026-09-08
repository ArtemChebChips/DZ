import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const [legacyArg = 'legacy/dist', codexArg = 'codex/dist', outArg = 'site'] = process.argv.slice(2)
const legacy = resolve(legacyArg), codex = resolve(codexArg), out = resolve(outArg)
if (existsSync(out)) throw new Error('Выходной каталог должен быть новым, чтобы не смешать сборки')
for (const dir of [legacy, codex]) {
  for (const file of ['index.html', 'sw.js', 'manifest.webmanifest']) assert.ok(existsSync(resolve(dir, file)), `Нет ${file} в ${dir}`)
}
const oldManifest = JSON.parse(readFileSync(resolve(legacy, 'manifest.webmanifest'), 'utf8'))
const newManifest = JSON.parse(readFileSync(resolve(codex, 'manifest.webmanifest'), 'utf8'))
assert.equal(newManifest.scope, `${oldManifest.scope}codex/`)
assert.equal(newManifest.id, newManifest.scope)
assert.notEqual(newManifest.name, oldManifest.name)
assert.ok(readFileSync(resolve(legacy, 'sw.js'), 'utf8').includes('codex-bridge.js'))
assert.ok(!readFileSync(resolve(legacy, 'sw.js'), 'utf8').includes('cleanupOutdatedCaches('))
assert.ok(!readFileSync(resolve(legacy, 'sw.js'), 'utf8').includes('codex/assets/'))
mkdirSync(out, { recursive: true })
cpSync(legacy, out, { recursive: true })
cpSync(codex, resolve(out, 'codex'), { recursive: true })
console.log('Две независимые сборки объединены. Manifest и границы кеширования проверены.')
