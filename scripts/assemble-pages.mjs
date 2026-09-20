import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const [appArg = 'next/dist-design', legacyArg = 'legacy/dist', codexArg = 'codex/dist', outArg = 'site'] = process.argv.slice(2)
const app = resolve(appArg), legacy = resolve(legacyArg), codex = resolve(codexArg), out = resolve(outArg)
assert.ok(!existsSync(out), 'Каталог публикации должен быть новым')
for (const dir of [app, legacy, codex]) assert.ok(existsSync(resolve(dir, 'index.html')))
const html = readFileSync(resolve(app, 'index.html'), 'utf8')
assert.ok(html.includes('./assets/'), 'Новая сборка должна использовать относительные пути')
assert.ok(existsSync(resolve(app, 'sw.js')), 'Нужен worker для обновления старого ярлыка')
mkdirSync(out, { recursive: true })
cpSync(app, out, { recursive: true })
cpSync(app, resolve(out, 'next'), { recursive: true })
cpSync(legacy, resolve(out, 'legacy'), { recursive: true })
cpSync(codex, resolve(out, 'codex'), { recursive: true })
console.log('Новая версия: корень и /next/. Прежние: /legacy/ и /codex/.')
