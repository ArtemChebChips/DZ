import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { STARTUP_KEY, readStartupHistory, saveStartupReport, markDuration, formatStartupReport, startStartupDiagnostics, refreshStartupReport, afterStartupShellFrame, getStartupReport } from '../design/startup.ts'

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
test('Стартовый HTML не обращается к хранилищу и выбирает только доступную без него палитру', () => {
  const html = readFileSync(new URL('../design/index.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  assert.match(html, /id="startup-shell" role="status"/)
  for (const [search, systemDark, expected] of [['', false, 'light'], ['', true, 'dark'], ['?demo=1', true, 'light'], ['?demo=1&theme=black', false, 'black']]) {
    let reads = 0
    const root = { dataset: {}, style: {} }
    const context = { window: {}, navigator: { onLine: false }, document: { hidden: false, documentElement: root, querySelector: () => ({ content: '' }) }, location: { search }, URLSearchParams, matchMedia: () => ({ matches: systemDark }), performance: { now: () => 10 } }
    Object.defineProperty(context, 'localStorage', { get() { reads++; throw Error('хранилище ещё не готово') } })
    vm.runInNewContext(script, context)
    assert.equal(reads, 0)
    assert.equal(context.window.__dzBoot.marks.themeReadStart, undefined)
    assert.equal(root.dataset.theme, expected)
  }
})
test('Чтение приложения ждёт два кадра оболочки и отдельную задачу; без кадров не начинается', () => {
  const frames = [], tasks = []
  const originals = Object.fromEntries(['requestAnimationFrame', 'setTimeout', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  let started = false
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { __dzBoot: { marks: {} } } })
    globalThis.requestAnimationFrame = fn => { frames.push(fn) }
    globalThis.setTimeout = fn => { tasks.push(fn) }
    afterStartupShellFrame(() => { started = true })
    assert.equal(started, false)
    assert.equal(tasks.length, 0)
    frames.shift()()
    assert.equal(started, false)
    assert.equal(tasks.length, 0)
    frames.shift()()
    assert.equal(started, false)
    assert.equal(typeof window.__dzBoot.marks.shellFrameEstimate, 'number')
    tasks.shift()()
    assert.equal(started, true)
    assert(window.__dzBoot.marks.appRenderStart >= window.__dzBoot.marks.shellFrameEstimate)
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
test('При доступном Paint Timing ждём FCP; отсутствие записи не оставляет приложение на оболочке', () => {
  const keys = ['requestAnimationFrame', 'setTimeout', 'clearTimeout', 'PerformanceObserver', 'window']
  const originals = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  try {
    for (const sendPaint of [true, false]) {
      const frames = [], timers = new Map()
      let callback, started = 0, disconnected = false, nextTimer = 0
      const replacements = {
        window: { __dzBoot: { marks: {} } }, requestAnimationFrame: fn => frames.push(fn),
        setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id }, clearTimeout: id => timers.delete(id),
        PerformanceObserver: class {
          static supportedEntryTypes = ['paint']
          constructor(fn) { callback = fn }
          observe() {}
          disconnect() { disconnected = true }
        },
      }
      for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
      afterStartupShellFrame(() => { started++ })
      frames.shift()(); frames.shift()()
      assert.equal(started, 0)
      assert.equal([...timers.values()][0].delay, 100)
      if (sendPaint) callback({ getEntries: () => [{ name: 'first-contentful-paint' }] })
      else [...timers.values()][0].fn()
      assert(disconnected)
      assert.equal(timers.size, 1)
      assert.equal([...timers.values()][0].delay, 0)
      const task = [...timers.values()][0]
      timers.clear(); task.fn()
      callback({ getEntries: () => [{ name: 'first-contentful-paint' }] })
      assert.equal(started, 1)
      assert.equal(timers.size, 0)
    }
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
function worker(cached) {
  const handlers = {}, calls = []
  let now = 10
  const workerPerformance = { timeOrigin: 100000, now: () => now }
  const code = readFileSync(new URL('../design/public/sw.js', import.meta.url), 'utf8').replace("'dev' /*__VERSION__*/", "'1.23.60'").replace("'dev' /*__BUILD__*/", "'test-build'").replace('[] /*__PRECACHE__*/', '["index.html","assets/app.js"]')
  vm.runInNewContext(code, { URL, Headers, Response, Request, performance: workerPerformance, self: { registration: { scope: 'https://test.example/DZ/' }, location: { origin: 'https://test.example' }, addEventListener: (name, fn) => { handlers[name] = fn } }, caches: { open: async () => { now += 25; return { match: async () => { now += 12; return cached?.clone() } } } }, fetch: async () => { calls.push('network'); return new Response('network HTML') } })
  now = 100
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
  assert.match(response.headers.get('Server-Timing'), /dz-worker-script;desc="100010.0"/)
  assert.match(response.headers.get('Server-Timing'), /dz-fetch-event;desc="100100.0"/)
  assert.match(response.headers.get('Server-Timing'), /dz-cache-open;dur=25.0/)
  assert.match(response.headers.get('Server-Timing'), /dz-cache-match;dur=12.0/)
  assert.match(response.headers.get('Server-Timing'), /dz-response-ready;desc="100137.0"/)
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
  const nav = { type: 'navigate', serverTiming: [
    { name: 'dz-source', description: 'cache' }, { name: 'dz-worker-script', description: '100010' },
    { name: 'dz-fetch-event', description: '100100' }, { name: 'dz-response-ready', description: '100137' },
    { name: 'dz-cache-open', duration: 25 }, { name: 'dz-cache-match', duration: 12 },
  ] }
  const replacements = { window: win, document: doc, navigator: { serviceWorker: sw, onLine: false, userAgent: 'test Safari' }, location: { search: '', origin: 'https://test.example' }, localStorage: store, matchMedia: () => ({ matches: true }), performance: { timeOrigin: 100050, now: () => 50, getEntriesByType: type => type === 'navigation' ? [nav] : [] } }
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
    assert.equal(saved.shell.workerScriptStart, -40)
    assert.equal(saved.shell.fetchEventStart, 50)
    assert.equal(saved.shell.responseReady, 87)
    assert.equal(saved.shell.cacheOpenMs, 25)
    assert.equal(saved.shell.cacheMatchMs, 12)
    nav.serverTiming = [{ name: 'dz-source', description: 'cache' }]
    assert.equal(getStartupReport().shell.workerScriptStart, null)
    assert.equal(getStartupReport().shell.cacheOpenMs, null)
    assert(!store.data.get(STARTUP_KEY).includes('НЕ КОПИРОВАТЬ'))
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
