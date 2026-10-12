import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { STARTUP_KEY, readStartupHistory, saveStartupReport, markDuration, formatStartupReport, startStartupDiagnostics, refreshStartupReport } from '../design/startup.ts'

const report = id => ({ schema: 1, id: String(id), version: '1.23.60', startedAt: '2026-10-12T10:00:00.000Z', demo: false, marks: { pageScript: 0, themeReadStart: 2, themeReadEnd: 7002 }, assets: [] })
function storage() {
  const data = new Map([['dz-next:v1', 'личные задания'], ['dz:data', 'прежние данные']])
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}
test('История ограничена пятью запусками и не касается базы заданий', () => {
  const store = storage()
  for (let i = 0; i < 8; i++) saveStartupReport(store, report(i))
  assert.deepEqual(readStartupHistory(store).map(r => r.id), ['7', '6', '5', '4', '3'])
  saveStartupReport(store, { ...report(7), marks: { frameEstimate: 9000 } })
  assert.equal(readStartupHistory(store).length, 5)
  assert.equal(readStartupHistory(store)[0].marks.frameEstimate, 9000)
  assert.equal(store.data.get('dz-next:v1'), 'личные задания')
  assert.equal(store.data.get('dz:data'), 'прежние данные')
  assert(!formatStartupReport(report(7), readStartupHistory(store)).includes('личные задания'))
})
test('Демо не читает и не пишет историю; повреждённая история и отказ чтения безопасны', () => {
  saveStartupReport({ getItem() { throw Error('read') }, setItem() { throw Error('write') } }, { ...report(1), demo: true })
  for (const raw of ['{', '{}', '[null,{},42]', 'x'.repeat(100001)]) assert.deepEqual(readStartupHistory({ getItem: () => raw }), [])
  assert.deepEqual(readStartupHistory({ getItem() { throw Error('denied') } }), [])
  assert.throws(() => saveStartupReport({ getItem: () => null, setItem() { throw Error('quota') } }, report(1)), /quota/)
})
test('Нулевой момент допустим, отсутствие измерения не превращается в ноль', () => {
  assert.equal(markDuration(report(1), 'pageScript', 'themeReadStart'), 2)
  assert.equal(markDuration(report(1), 'themeReadStart', 'themeReadEnd'), 7000)
  assert.equal(markDuration(report(1), 'notebookReadStart', 'notebookReadEnd'), null)
})
test('Ранний замер ловит медленный localStorage, не сохраняет содержимое и не ломает демо', () => {
  const html = readFileSync(new URL('../design/index.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  for (const demo of [false, true]) {
    let time = 10, reads = 0
    const root = { dataset: {}, style: {} }
    const context = { window: {}, navigator: { onLine: false }, document: { hidden: false, documentElement: root, querySelector: () => ({ content: '' }) }, location: { search: demo ? '?demo=1' : '' }, URLSearchParams, matchMedia: () => ({ matches: false }), performance: { now: () => time }, localStorage: { getItem(key) { reads++; assert.equal(key, 'dz-next:v1'); time += 7000; return '{"theme":"black","tasks":[{"title":"секретное задание"}]}' } } }
    vm.runInNewContext(script, context)
    assert.equal(reads, demo ? 0 : 1)
    assert.equal(context.window.__dzBoot.marks.themeReadEnd - context.window.__dzBoot.marks.themeReadStart, demo ? 0 : 7000)
    assert(!JSON.stringify(context.window.__dzBoot).includes('секретное'))
    assert.equal(root.dataset.theme, demo ? 'light' : 'black')
  }
})
function worker(cached) {
  const handlers = {}, calls = []
  const code = readFileSync(new URL('../design/public/sw.js', import.meta.url), 'utf8').replace("'dev' /*__VERSION__*/", "'1.23.60'").replace("'dev' /*__BUILD__*/", "'test-build'").replace('[] /*__PRECACHE__*/', '["index.html","assets/app.js"]')
  vm.runInNewContext(code, { URL, Headers, Response, Request, performance, self: { registration: { scope: 'https://test.example/DZ/' }, location: { origin: 'https://test.example' }, addEventListener: (name, fn) => { handlers[name] = fn } }, caches: { open: async () => ({ match: async () => cached?.clone() }) }, fetch: async () => { calls.push('network'); return new Response('network HTML') } })
  return { handlers, calls }
}
test('Замеры worker сохраняют мгновенный кеш, тело и заголовки ответа', async () => {
  const { handlers, calls } = worker(new Response('<html>offline</html>', { headers: { 'Content-Type': 'text/html' } }))
  let promise
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://test.example/DZ/?screen=settings' }, respondWith: result => { promise = result } })
  const response = await promise
  assert.equal(await response.text(), '<html>offline</html>')
  assert.equal(response.headers.get('Content-Type'), 'text/html')
  assert.match(response.headers.get('Server-Timing'), /dz-source;desc="cache"/)
  assert.match(response.headers.get('Server-Timing'), /dz-version;desc="1.23.60"/)
  assert.deepEqual(calls, [])
  let reply
  handlers.message({ data: { type: 'DZ_STARTUP_INFO' }, ports: [{ postMessage: value => { reply = value } }] })
  assert.equal(reply.build, 'test-build')
})
test('Нет кеша: отчёт честно помечает сеть; demo по-прежнему пропускается', async () => {
  const { handlers, calls } = worker(null)
  let promise
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://test.example/DZ/' }, respondWith: result => { promise = result } })
  const response = await promise
  assert.match(response.headers.get('Server-Timing'), /dz-source;desc="network"/)
  assert.equal(await response.text(), 'network HTML')
  assert.deepEqual(calls, ['network'])
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://test.example/DZ/?demo=1' }, respondWith() { assert.fail('demo intercepted') } })
})
test('Открытие отчёта без rAF получает worker и историю, не выдумывая кадр', async () => {
  const store = storage()
  const win = new EventTarget(), doc = new EventTarget(), sw = new EventTarget()
  win.__dzBoot = { marks: { pageScript: 8 }, hiddenAtStart: false, onlineAtStart: false, tasks: 'НЕ КОПИРОВАТЬ' }
  doc.hidden = false
  sw.controller = { scriptURL: 'https://test.example/DZ/sw.js', postMessage(data, ports) { ports[0].postMessage({ type: data.type, version: '1.23.60', build: 'worker-test' }) } }
  const replacements = { window: win, document: doc, navigator: { serviceWorker: sw, onLine: false, userAgent: 'test Safari' }, location: { search: '', origin: 'https://test.example' }, localStorage: store, matchMedia: () => ({ matches: true }) }
  const originals = Object.fromEntries(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  try {
    for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value })
    startStartupDiagnostics('1.23.60')
    const first = refreshStartupReport()
    assert.equal(refreshStartupReport(), first)
    await first
    const saved = readStartupHistory(store)[0]
    assert.equal(saved.worker.build, 'worker-test')
    assert.equal(saved.workerStatus, 'Ответ получен')
    assert.equal(saved.marks.frameEstimate, undefined)
    assert(!store.data.get(STARTUP_KEY).includes('НЕ КОПИРОВАТЬ'))
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
