import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.DZ_PLAYWRIGHT_PATH || 'playwright')
const baseURL = process.env.DZ_BASE_URL || 'http://127.0.0.1:43187/'
const browser = await chromium.launch({ headless: true, ...(process.env.DZ_CHROME_PATH ? { executablePath: process.env.DZ_CHROME_PATH } : {}) })
await mkdir('audit/screenshots', { recursive: true })
const tasks = [
  { id: 'one', title: 'Решить задачи 12–18 и оформить решение в тетради', subjectId: 'phys', due: '2026-10-05', done: false, kind: 'seminar', lessonId: 'pn-4', entryType: 'homework' },
  { id: 'two', title: 'Закончить подробный отчёт по лабораторной: таблицы результатов, графики и выводы', subjectId: 'it', due: '2026-10-07', done: false, kind: 'lab', lessonId: 'sr-3', entryType: 'homework' },
  { id: 'three', title: 'Повторить конспект к семинару', subjectId: 'prob', due: '2026-10-06', done: false, entryType: 'homework' },
  { id: 'note', title: 'Распечатать материалы на неделю', subjectId: '', due: '2026-10-05', done: false, entryType: 'note' },
  { id: 'late', title: 'Отправить преподавателю расчётную работу', subjectId: 'mech', due: '2026-10-04', done: false, entryType: 'homework' },
]
const notebook = { version: 1, tasks, theme: 'light', collapsed: [] }
try {
  for (const [name, viewport] of [['mobile', { width: 375, height: 812 }], ['desktop', { width: 1200, height: 900 }]]) {
    const context = await browser.newContext({ viewport, timezoneId: 'Europe/Moscow', locale: 'ru-RU', reducedMotion: 'reduce', ...(name === 'mobile' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) })
    const page = await context.newPage()
    await page.clock.install({ time: new Date('2026-10-05T14:30:00+03:00') })
    await page.addInitScript(data => localStorage.setItem('dz-next:v1', JSON.stringify(data)), notebook)
    await page.goto(baseURL)
    await page.getByRole('navigation').waitFor()
    await page.screenshot({ path: `audit/screenshots/${name}-schedule.png` })
    await page.getByRole('navigation').getByRole('button', { name: 'Задачи', exact: true }).click()
    await page.screenshot({ path: `audit/screenshots/${name}-tasks.png` })
    await page.getByRole('button', { name: 'Задание', exact: true }).click()
    await page.getByRole('dialog').getByRole('textbox', { name: 'Что нужно сделать' }).fill('Подготовиться к следующему семинару')
    await page.screenshot({ path: `audit/screenshots/${name}-editor.png` })
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.getByRole('navigation').getByRole('button', { name: 'Настройки', exact: true }).click()
    await page.screenshot({ path: `audit/screenshots/${name}-settings.png` })
    await context.close()
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Moscow', reducedMotion: 'reduce' })
  const page = await context.newPage()
  const stress = { ...notebook, tasks: Array.from({ length: 1000 }, (_, index) => ({ id: `stress-${index}`, title: `Задание ${index}: проверить расчёты и оформить решение`, subjectId: index % 2 ? 'phys' : 'it', due: `2026-10-${String(index % 28 + 1).padStart(2, '0')}`, done: false, entryType: 'homework' })) }
  await page.addInitScript(data => localStorage.setItem('dz-next:v1', JSON.stringify(data)), stress)
  const begin = performance.now()
  await page.goto(baseURL)
  await page.getByRole('navigation').waitFor()
  const launchMs = performance.now() - begin
  const switchMs = await page.evaluate(async () => {
    const started = performance.now()
    const button = [...document.querySelectorAll('.app-nav button')].find(button => button.textContent === 'Задачи')
    button.click()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return performance.now() - started
  })
  const result = { fixture: '1000 synthetic tasks, 28 days, mobile Chromium 390x844, reduced motion', launchMs: Math.round(launchMs), taskTabSwitchToTwoFramesMs: Math.round(switchMs), renderedTaskRows: await page.locator('.task-row').count(), domElements: await page.locator('*').count(), savedTaskCount: await page.evaluate(() => JSON.parse(localStorage.getItem('dz-next:v1')).tasks.length), note: 'Local reference measurement; includes browser automation and machine load. No iPhone or production network claim.' }
  await writeFile('audit/browser-stress.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
  await context.close()
} finally { await browser.close() }
