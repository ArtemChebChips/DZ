// Только синтетические данные на отдельном локальном origin.
// Запуск после build:design, Playwright берётся из окружения без новой зависимости.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.DZ_PLAYWRIGHT_PATH || 'playwright')
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname.replace(/^\/next\//, '/')
  if (path.includes('..')) { res.writeHead(400); res.end(); return }
  const file = path === '/' ? 'index.html' : path.slice(1)
  try {
    const body = await readFile(new URL(`../../dist-design/${file}`, import.meta.url))
    const type = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', webmanifest: 'application/manifest+json' }[file.split('.').pop()]
    res.writeHead(200, { 'Content-Type': type || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
let browser
const sample = { version: 1, theme: 'black', animationSpeed: 'fast', collapsed: [], tasks: [{ id: 'synthetic', title: 'Проверка сохранённых данных', due: '2026-10-12', done: false, subjectId: '', entryType: 'note' }] }
try {
  browser = await chromium.launch({ headless: true, ...(process.env.DZ_CHROME_PATH ? { executablePath: process.env.DZ_CHROME_PATH } : {}) })
  for (const mode of ['slow', 'denied', 'demo']) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: 'light' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(({ sample, mode }) => {
      const storage = window.localStorage
      const raw = JSON.stringify(sample)
      storage.setItem('dz-next:v1', raw)
      window.startupTest = { reads: [], writes: [], raw }
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) { window.startupTest.writes.push(key); return set.call(this, key, value) }
      Object.defineProperty(window, 'localStorage', { get() {
        if (mode === 'denied') throw new DOMException('Тест отказа доступа', 'SecurityError')
        if (!window.startupTest.reads.length) {
          window.startupTest.reads.push({ start: performance.now(), shell: !!document.getElementById('startup-shell'), shellText: document.getElementById('startup-shell')?.textContent, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime })
          if (mode === 'slow') { const end = performance.now() + 900; while (performance.now() < end) { /* Медленный первый доступ */ } }
        }
        return storage
      } })
    }, { sample, mode })
    await page.goto(base + (mode === 'demo' ? '/?demo=1&theme=dark&screen=settings' : '/?screen=settings'))
    await page.getByRole('button', { name: 'Диагностика запуска', exact: false }).waitFor()
    assert.equal(await page.locator('#startup-shell').count(), 0)
    if (mode === 'slow') {
      // Запись Paint Timing может попасть в буфер позже самого кадра.
      await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0)
      const metrics = await page.evaluate(() => ({ ...window.startupTest, fcp: performance.getEntriesByName('first-contentful-paint')[0].startTime, marks: window.__dzBoot.marks, rawNow: localStorage.getItem('dz-next:v1'), theme: document.documentElement.dataset.theme, motion: document.documentElement.dataset.motion }))
      assert(metrics.reads[0].shell)
      assert.equal(metrics.reads[0].shellText, '')
      assert.equal(metrics.reads[0].fcp, undefined)
      assert(metrics.marks.notebookReadEnd - metrics.marks.notebookReadStart >= 890)
      assert(metrics.marks.shellFrameEstimate < metrics.marks.notebookReadStart)
      assert.equal(metrics.rawNow, metrics.raw)
      assert.equal(metrics.theme, 'black')
      assert.equal(metrics.motion, 'fast')
      assert(!metrics.writes.includes('dz-next:v1'))
      console.log(JSON.stringify({ scenario: 'Пустой фон до чтения; FCP относится к приложению', fcp: metrics.fcp, readStart: metrics.reads[0].start, readEnd: metrics.marks.notebookReadEnd }))
      await page.getByRole('button', { name: 'Диагностика запуска', exact: false }).click()
      await page.locator('textarea.startup-report').waitFor({ state: 'attached' })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      const output = await page.locator('textarea.startup-report').inputValue()
      assert(!output.includes(sample.tasks[0].title))
    } else if (mode === 'denied') {
      assert(await page.getByText('Не удалось прочитать сохранённые данные.', { exact: false }).count() > 0)
      assert.equal(await page.evaluate(() => window.__dzBoot.notebookReadFailed), true)
      assert.deepEqual(await page.evaluate(() => window.startupTest.writes), [])
    } else {
      assert.deepEqual(await page.evaluate(() => window.startupTest.reads), [])
      assert.deepEqual(await page.evaluate(() => window.startupTest.writes), [])
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
  // Оболочка видна даже без загруженного JS приложения, на обеих палитрах.
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme })
    const page = await context.newPage()
    let release
    const blocked = new Promise(resolve => { release = resolve })
    await page.route('**/assets/*.js', async route => { await blocked; await route.continue() })
    try {
      await page.goto(base, { waitUntil: 'commit' })
      await page.locator('#startup-shell').waitFor()
      assert.equal(await page.locator('#startup-shell').textContent(), '')
      assert.equal(await page.locator('#startup-shell').getAttribute('aria-hidden'), 'true')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      if (process.env.DZ_STARTUP_SCREENSHOTS) {
        await mkdir(process.env.DZ_STARTUP_SCREENSHOTS, { recursive: true })
        await page.screenshot({ path: `${process.env.DZ_STARTUP_SCREENSHOTS}/shell-${colorScheme}.png` })
      }
    } finally { release(); await context.close() }
  }
  // Настоящие SW/CacheStorage, оба опубликованных пути, затем полное отключение сети.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  for (const path of ['/', '/next/']) {
    await context.setOffline(false)
    const page = await context.newPage()
    await page.goto(base + path + '?screen=settings')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await context.setOffline(true)
    await page.reload()
    await page.getByRole('button', { name: 'Диагностика запуска', exact: false }).click()
    const output = await page.locator('textarea.startup-report').inputValue()
    const report = JSON.parse(output.slice(output.indexOf('\n[') + 1))[0]
    assert.equal(report.shell.source, 'cache')
    assert.equal(report.onlineAtStart, false)
    assert.equal(typeof report.shell.workerScriptStart, 'number')
    assert(report.shell.fetchEventStart >= 0)
    assert(report.shell.cacheOpenMs >= 0)
    assert(report.shell.cacheMatchMs >= 0)
    assert(report.shell.responseReady >= report.shell.fetchEventStart)
    assert(report.marks.notebookReadStart > report.marks.shellFrameEstimate)
    console.log(JSON.stringify({ scenario: 'Офлайн и новые замеры', path, shell: report.shell }))
    await page.close()
  }
  await context.close()
  console.log('Проверки запуска, сохранности данных, ошибок чтения, демо, палитр и офлайн пройдены.')
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
