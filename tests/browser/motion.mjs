// Synthetic mobile Chrome input; no physical iPhone or device FPS claim.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.DZ_PLAYWRIGHT_PATH || 'playwright')
const base = process.env.DZ_BASE_URL || 'http://127.0.0.1:43187/'
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(repository, 'audit/screenshots')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.DZ_CHROME_PATH ? { executablePath: process.env.DZ_CHROME_PATH } : {}) })
const results = { capturedAt: new Date().toISOString(), base, environment: 'Mobile Chrome emulation, 375×812, DPR 2; synthetic demo data', themes: [], modal: [] }
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const secondsToMs = text => parseFloat(text) * (text.trim().endsWith('ms') ? 1 : 1000)
async function touch(session, type, x = 0, y = 0) {
  await session.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] })
}
async function held(page, session, target, owner, radius, label) {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  assert(box)
  await touch(session, 'touchStart', box.x + box.width / 2, box.y + box.height / 2)
  await frames(page)
  const appearance = await owner.evaluate(element => {
    const style = getComputedStyle(element)
    const overlay = getComputedStyle(element, '::after')
    return { pressed: element.hasAttribute('data-pressed'), radius: style.borderTopLeftRadius, overlayRadius: overlay.borderTopLeftRadius, opacity: Number(overlay.opacity), width: parseFloat(overlay.width), height: parseFloat(overlay.height), clientWidth: element.clientWidth, clientHeight: element.clientHeight, tint: overlay.backgroundColor }
  })
  assert.equal(appearance.pressed, true, `${label}: whole owner must respond to pointerdown`)
  assert.equal(appearance.radius, `${radius}px`)
  assert.equal(appearance.overlayRadius, `${radius}px`)
  assert.equal(appearance.opacity, 1)
  assert(Math.abs(appearance.width - appearance.clientWidth) <= 1, `${label}: overlay does not cover whole width: ${JSON.stringify(appearance)}`)
  assert(Math.abs(appearance.height - appearance.clientHeight) <= 1, `${label}: overlay does not cover whole height: ${JSON.stringify(appearance)}`)
  await page.screenshot({ path: resolve(output, `motion-${label}.png`) })
  await touch(session, 'touchCancel')
  await page.waitForTimeout(130)
  assert.equal(await owner.evaluate(element => element.hasAttribute('data-pressed')), false)
  assert.equal(await page.locator('dialog[open]').count(), 0, `${label}: cancelled touch must not open a modal`)
  return appearance
}
async function modalProbe(page, target, closing = false) {
  await page.evaluate(closing => {
    window.motionProbe = new Promise(resolve => {
      document.addEventListener('click', () => {
        const start = performance.now()
        let frame = 0, openedFrames = null, visibleFrames = null, beganMs = null, duration = null, animationName = null
        const samples = []
        const sample = () => {
          frame++
          const dialog = document.querySelector('dialog[open]')
          if (dialog) {
            const style = getComputedStyle(dialog)
            const animation = dialog.getAnimations().find(animation => animation.animationName === (closing ? 'sheet-exit' : 'sheet-enter'))
            samples.push({ frame, elapsedMs: performance.now() - start, opacity: Number(style.opacity), animationTime: animation?.currentTime ?? null, pending: animation?.pending ?? null })
            if ((!closing || dialog.classList.contains('sheet-closing')) && openedFrames === null) {
              openedFrames = frame; beganMs = performance.now() - start
              duration = style.animationDuration; animationName = style.animationName
            }
            if (openedFrames !== null && Number(style.opacity) > 0 && visibleFrames === null) visibleFrames = frame
          }
          if (openedFrames !== null && (visibleFrames !== null || closing)) return resolve({ openedFrames, visibleFrames, beganMs, duration, animationName, samples })
          if (frame >= 6) return resolve({ openedFrames, visibleFrames, beganMs, duration, animationName, samples })
          requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      }, { capture: true, once: true })
    })
  }, closing)
  await target.click()
  const probe = await page.evaluate(() => window.motionProbe)
  assert(probe.openedFrames !== null && probe.openedFrames <= 2, `Modal ${closing ? 'close' : 'open'} starts too late: ${JSON.stringify(probe)}`)
  // rAF samples run before paint. Record the first positive opacity separately;
  // the regression contract is immediate dialog/animation initiation, not FPS.
  if (!closing) assert(probe.visibleFrames !== null, `Modal never becomes visible: ${JSON.stringify(probe)}`)
  assert.equal(secondsToMs(probe.duration), 200)
  assert.equal(probe.animationName, closing ? 'sheet-exit' : 'sheet-enter')
  return probe
}
try {
  for (const theme of ['light', 'dark', 'black']) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: 'Europe/Moscow', locale: 'ru-RU', reducedMotion: 'no-preference', serviceWorkers: 'block' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const session = await context.newCDPSession(page)
    const go = async screen => {
      const url = new URL(base)
      url.search = new URLSearchParams({ demo: '1', theme, fixture: 'stress', screen }).toString()
      await page.goto(url.href)
      await page.getByRole('navigation').waitFor()
      await frames(page)
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
    }
    await go('settings')
    const bundleURLs = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(script => script.src))
    const setting = page.getByRole('button', { name: /Предметы Список предметов/ })
    const settingsAppearance = await held(page, session, setting, setting, 18, `${theme}-settings`)
    const subjectsOpen = await modalProbe(page, setting)
    const dialog = page.getByRole('dialog')
    await dialog.evaluate(async element => { await Promise.allSettled(element.getAnimations().map(animation => animation.finished)) })
    await page.screenshot({ path: resolve(output, `motion-${theme}-subjects.png`) })
    const subjectsClose = await modalProbe(page, dialog.getByRole('button', { name: 'Закрыть', exact: true }), true)
    await dialog.waitFor({ state: 'hidden' })

    await go('tasks')
    const row = page.locator('.task-period .task-row').first()
    const taskAppearance = await held(page, session, row.locator('.task-content'), row, 16, `${theme}-task`)
    // A real emulated touch move must clear the feedback and suppress editing.
    const taskBox = await row.locator('.task-content').boundingBox()
    await touch(session, 'touchStart', taskBox.x + taskBox.width / 2, taskBox.y + taskBox.height / 2)
    await touch(session, 'touchMove', taskBox.x + taskBox.width / 2 + 35, taskBox.y + taskBox.height / 2)
    await touch(session, 'touchEnd')
    await page.waitForTimeout(150)
    assert.equal(await page.locator('.task-row[data-pressed]').count(), 0)
    assert.equal(await page.locator('dialog[open]').count(), 0)

    await go('schedule')
    const current = page.locator('.day-page[data-current]')
    const lesson = current.locator('.lesson').first()
    const lessonAppearance = await held(page, session, lesson.locator('.lesson-open'), lesson, 22, `${theme}-lesson`)
    const calendarOpen = await modalProbe(page, current.getByRole('button', { name: 'Календарь', exact: true }))
    const calendar = page.getByRole('dialog')
    await calendar.evaluate(async element => { await Promise.allSettled(element.getAnimations().map(animation => animation.finished)) })
    await page.screenshot({ path: resolve(output, `motion-${theme}-calendar.png`) })
    const calendarClose = await modalProbe(page, calendar.getByRole('button', { name: 'Закрыть', exact: true }), true)
    await calendar.waitFor({ state: 'hidden' })
    assert.deepEqual(errors, [])
    results.themes.push({ theme, bundleURLs, settingsAppearance, taskAppearance, lessonAppearance, touchMoveCancelled: true, errors })
    results.modal.push({ theme, subjectsOpen, subjectsClose, calendarOpen, calendarClose })
    await context.close()
  }
  await writeFile(resolve(repository, 'audit/motion-results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally { await browser.close() }
