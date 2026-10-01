// Отдельный повторяемый прогон движения дня. Данные — только ?demo=1
// в новых изолированных профилях; CDP проверяет настоящий браузерный touch.
// DZ_PLAYWRIGHT_PATH=/path/to/playwright DZ_CHROME_PATH=/path/to/chrome \
// node --test tests/browser/swipe-motion.mjs
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium, devices } = require(process.env.DZ_PLAYWRIGHT_PATH || 'playwright')
const baseURL = process.env.DZ_BASE_URL || 'http://127.0.0.1:43187/'
const results = { capturedAt: new Date().toISOString(), baseURL, device: 'Chrome, iPhone 13 emulation', realIPhone: false, scenarios: [] }
let browser
before(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.DZ_CHROME_PATH ? { executablePath: process.env.DZ_CHROME_PATH } : {}) })
})
after(async () => {
  await browser?.close()
  await mkdir('audit', { recursive: true })
  await writeFile('audit/swipe-motion-results.json', JSON.stringify(results, null, 2) + '\n')
})
const current = page => page.locator('.day-page[data-current]')
async function state(page) {
  return page.evaluate(() => {
    const track = document.querySelector('.day-track')
    const page = document.querySelector('.day-page[data-current]')
    return { date: page.querySelector('time[datetime]').getAttribute('datetime'),
      offset: new DOMMatrix(getComputedStyle(track).transform).m41,
      width: track.getBoundingClientRect().width, transform: track.style.transform,
      dragging: document.querySelector('[data-swipe-days]').hasAttribute('data-day-dragging'),
      scroll: page.querySelector('.app-scroll').scrollTop,
      dialogs: document.querySelectorAll('dialog[open]').length }
  })
}
async function touch(page, type, x, y = 300, time = 1000, id = 1, extra = []) {
  await current(page).locator('.app-scroll').evaluate((element, { type, x, y, time, id, extra }) => {
    const make = p => new Touch({ identifier: p.id, target: element, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y })
    const finger = make({ x, y, id })
    const points = type === 'touchend' || type === 'touchcancel' ? [] : [finger, ...extra.map(make)]
    const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches: points, targetTouches: points, changedTouches: [finger] })
    // Контролируем только временные точки жеста, не внутренние функции хука.
    Object.defineProperty(event, 'timeStamp', { value: time })
    element.dispatchEvent(event)
  }, { type, x, y, time, id, extra })
}
async function flick(page, direction = 1, time = 1000) {
  await touch(page, 'touchstart', 250, 300, time)
  await touch(page, 'touchmove', 250 - direction * 44, 300, time + 40)
  await touch(page, 'touchend', 250 - direction * 44, 300, time + 45)
}
function scenario(name, run, { real = false, reduced = 'no-preference' } = {}) {
  test(name, { timeout: 30_000 }, async () => {
    const context = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined, locale: 'ru-RU', timezoneId: 'Europe/Moscow', reducedMotion: reduced })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const entry = { name, input: real ? 'Trusted CDP touch + controlled CDP sample timestamps; real browser RAF' : 'DOM TouchEvent + controlled sample timestamps/RAF', passed: false }
    results.scenarios.push(entry)
    try {
      if (!real) await page.clock.install({ time: new Date('2026-10-01T12:00:00+03:00') })
      await page.addInitScript(() => localStorage.setItem('dz-next:v1', 'Изолированный оригинал не должен изменяться'))
      await page.goto(new URL('?demo=1&fixture=stress', baseURL).href, { waitUntil: 'domcontentloaded' })
      await page.getByRole('navigation').waitFor()
      if (!results.scriptURL) {
        results.scriptURL = await page.locator('script[type="module"][src]').getAttribute('src')
        await page.getByRole('navigation').getByRole('button', { name: 'Настройки', exact: true }).click()
        results.appVersion = (await page.getByRole('button', { name: /^О приложении/ }).innerText()).match(/Версия\s+([\d.]+)/)[1]
        await page.getByRole('navigation').getByRole('button', { name: 'Расписание', exact: true }).click()
      }
      if (!real) await page.clock.pauseAt(new Date('2026-10-01T12:05:00+03:00'))
      entry.initial = await state(page)
      entry.evidence = await run({ page, context })
      entry.final = await state(page)
      assert.deepEqual(errors, [])
      assert.equal(await page.evaluate(() => localStorage.getItem('dz-next:v1')), 'Изолированный оригинал не должен изменяться')
      entry.passed = true
    } catch (error) {
      entry.error = error.stack
      entry.failedState = await state(page).catch(() => null)
      entry.touchEvents = await page.evaluate(() => window.swipeTouchSamples).catch(() => null)
      throw error
    }
    finally { await context.close() }
  })
}

scenario('Настоящий CDP: ровное следование пальцу и короткий быстрый взмах 44 px', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page)
  const samples = []
  await page.evaluate(() => {
    window.swipeTouchSamples = []
    for (const type of ['touchstart', 'touchmove', 'touchend']) document.addEventListener(type, event => {
      window.swipeTouchSamples.push({ type, time: event.timeStamp, x: event.changedTouches[0]?.clientX, trusted: event.isTrusted })
    }, true)
  })
  const timestamp = Date.now() / 1000
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', timestamp, touchPoints: [{ x: 250, y: 300, id: 1 }] })
  // Chrome не отправляет DOM touchmove до своего нативного slop (~15 px).
  // Проверяем каждый реально доставленный move, начиная с 24 px.
  for (const [x, elapsed] of [[226, .020], [216, .035], [206, .050]]) {
    // Замеры DOM между событиями не должны превращать быстрый взмах в
    // медленное движение: задаём реальные sample timestamps в CDP.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', timestamp: timestamp + elapsed, touchPoints: [{ x, y: 300, id: 1 }] })
    const result = await state(page)
    assert.equal(result.offset, x - 250, 'Координата страницы совпадает с пальцем сразу после touchmove')
    assert.equal(result.scroll, 0)
    samples.push({ x, offset: result.offset })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', timestamp: timestamp + .055, touchPoints: [] })
  await page.waitForFunction(() => document.querySelector('.day-page[data-current] time[datetime]').getAttribute('datetime') === '2026-09-22', null, { timeout: 2500 })
  assert.equal((await state(page)).offset, 0)
  assert.equal((await state(page)).dialogs, 0)
  const touchEvents = await page.evaluate(() => window.swipeTouchSamples)
  assert(touchEvents.every(event => event.trusted), 'CDP доставляет настоящий trusted браузерный touch')
  return { samples, touchEvents, controlledCDPTimestampsMs: [0, 20, 35, 50, 55] }
}, { real: true })

scenario('Пауза и слишком маленький взмах отменяют перелистывание', async ({ page }) => {
  const evidence = []
  for (const [distance, releaseTime] of [[20, 1025], [44, 1240]]) {
    await touch(page, 'touchstart', 250, 300, 1000)
    await touch(page, 'touchmove', 250 - distance, 300, 1020)
    assert.equal((await state(page)).offset, -distance)
    await touch(page, 'touchend', 250 - distance, 300, releaseTime)
    await page.clock.runFor(250)
    const result = await state(page)
    assert.equal(result.date, '2026-09-21')
    assert.equal(result.offset, 0)
    evidence.push({ distance, releaseTime, result })
  }
  return evidence
})

scenario('Touchcancel и второй палец не фиксируют выбранный день', async ({ page }) => {
  const evidence = []
  for (const mode of ['cancel', 'multitouch']) {
    await touch(page, 'touchstart', 250)
    await touch(page, 'touchmove', 100, 300, 1040)
    assert.equal((await state(page)).offset, -150)
    if (mode === 'cancel') await touch(page, 'touchcancel', 100, 300, 1045)
    else await touch(page, 'touchmove', 100, 300, 1045, 1, [{ x: 300, y: 300, id: 2 }])
    await page.clock.runFor(250)
    const result = await state(page)
    assert.equal(result.date, '2026-09-21')
    assert.equal(result.offset, 0)
    evidence.push({ mode, result })
  }
  return evidence
})

scenario('Повторные короткие взмахи и возврат работают по одному дню', async ({ page }) => {
  const dates = []
  for (const [index, direction] of [1, 1, -1, -1].entries()) {
    await flick(page, direction, 1000 + index * 1000)
    await page.clock.runFor(250)
    const result = await state(page)
    dates.push(result.date)
    assert.equal(result.offset, 0)
    assert.equal(result.dragging, false)
    assert.equal(result.dialogs, 0)
  }
  assert.deepEqual(dates, ['2026-09-22', '2026-09-23', '2026-09-22', '2026-09-21'])
  return { dates }
})

scenario('Прерывание доведения сохраняет позицию, не включает вертикальную прокрутку', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await page.getByRole('navigation').getByRole('button', { name: 'Настройки', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Расписание', exact: true }).click()
  await current(page).locator('.app-scroll').evaluate(el => { el.scrollTop = 70 })
  await flick(page)
  await page.clock.runFor(48)
  const before = await state(page)
  assert(before.offset < -44 && before.offset > -before.width)
  await touch(page, 'touchstart', 250, 300, 1100, 2)
  assert.equal((await state(page)).offset, before.offset, 'Новое касание не сбрасывает показанную страницу')
  await touch(page, 'touchmove', 250, 280, 1120, 2)
  const vertical = await state(page)
  assert.equal(vertical.offset, before.offset)
  assert.equal(vertical.scroll, before.scroll)
  await touch(page, 'touchmove', 270, 280, 1140, 2)
  assert.equal((await state(page)).offset, before.offset + 20)
  await touch(page, 'touchcancel', 270, 280, 1145, 2)
  await page.clock.runFor(250)
  assert.equal((await state(page)).date, '2026-09-21')
  assert.equal((await state(page)).offset, 0)
  return { before, vertical, final: await state(page) }
})

scenario('Reduced motion: следование пальцу сохраняется, отпускание и смена настройки без анимации', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await flick(page)
  const instant = await state(page)
  assert.equal(instant.date, '2026-09-22')
  assert.equal(instant.offset, 0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await flick(page, 1, 2000)
  await page.clock.runFor(32)
  const mid = await state(page)
  assert(mid.offset < 0)
  await page.evaluate(() => {
    window.swipeReduceDelivered = false
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { if (event.matches) window.swipeReduceDelivered = true })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => window.swipeReduceDelivered)
  const changed = await state(page)
  assert.equal(changed.date, '2026-09-23')
  assert.equal(changed.offset, 0)
  await page.clock.runFor(300)
  assert.equal((await state(page)).date, '2026-09-23')
  return { instant, mid, changed }
})

scenario('Последний кадр и React commit: геометрия входящего дня не прыгает', async ({ page }) => {
  await page.evaluate(() => {
    const track = document.querySelector('.day-track')
    const width = track.getBoundingClientRect().width
    window.swipeCommitFrames = []
    window.swipeDrawFrames = []
    function capture(kind, page) {
      const selectors = ['.agenda-heading', '.agenda-date', '.app-scroll', '.lesson', '.preview-tools']
      return { kind, date: page.querySelector('time[datetime]').getAttribute('datetime'),
        geometry: Object.fromEntries(selectors.map(selector => {
          const element = page.querySelector(selector)
          const rect = element?.getBoundingClientRect()
          return [selector, rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, text: element.textContent.slice(0, 80) } : null]
        })) }
    }
    // Наблюдаем реальные записи transform. Конечный transform и смена дня
    // происходят в одном JS-кадре, поэтому MutationObserver уже видит commit.
    Object.defineProperty(track.style, 'transform', {
      configurable: true,
      get() { return this.getPropertyValue('transform') },
      set(value) {
        this.setProperty('transform', value)
        const x = new DOMMatrix(value).m41
        window.swipeDrawFrames.push({ x, time: performance.now() })
        if (Math.abs(x + width) < .001) {
          window.swipeCommitFrames.push(capture('before', [...track.children].find(el => el.style.getPropertyValue('--day-position') === '1')))
        } else if (x === 0 && window.swipeCommitFrames.length === 1) {
          window.swipeCommitFrames.push(capture('after', track.querySelector('[data-current]')))
        }
      },
    })
  })
  await flick(page)
  await page.clock.runFor(250)
  const evidence = await page.evaluate(() => ({ commit: window.swipeCommitFrames, frames: window.swipeDrawFrames }))
  assert.equal(evidence.commit.length, 2)
  const [before, after] = evidence.commit
  assert.equal(before.date, '2026-09-22')
  assert.equal(after.date, before.date)
  assert.deepEqual(after.geometry, before.geometry, 'Входящий preview и новый текущий день имеют одинаковую геометрию/содержимое')
  const motion = evidence.frames.filter(frame => frame.x < -44)
  assert(motion.length >= 7, 'Доведение полной страницы имеет достаточно кадров для плавного торможения')
  for (let i = 1; i < motion.length; i++) assert(motion[i].x <= motion[i - 1].x, 'Нет отката/выхода за край')
  assert.equal(motion.at(-1).x, -(await state(page)).width)
  const lastStep = Math.abs(motion.at(-1).x - motion.at(-2).x)
  assert(lastStep < 12, `Последний шаг мал: ${lastStep}px`)
  assert.equal((await state(page)).transform, 'translate3d(0px, 0px, 0px)')
  return { ...evidence, lastStep, settleFrames: motion.length, settleElapsedMs: motion.at(-1).time - evidence.frames[0].time }
})
