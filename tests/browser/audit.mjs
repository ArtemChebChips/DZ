import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'

// Use an installed Playwright or the desktop bundled package; no application dependency.
const require = createRequire(import.meta.url)
const { chromium, devices } = require(process.env.DZ_PLAYWRIGHT_PATH || 'playwright')
const baseURL = process.env.DZ_BASE_URL || 'http://127.0.0.1:43187/'
const key = 'dz-next:v1'
const today = '2026-10-01'
let browser
before(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.DZ_CHROME_PATH ? { executablePath: process.env.DZ_CHROME_PATH } : {}) })
})
after(async () => { await browser?.close() })
const fresh = () => ({ version: 1, tasks: [], theme: 'system', collapsed: [] })
const personal = (title = 'Личный отчёт', patch = {}) => ({ id: 'personal', title, subjectId: 'phys', due: today, done: false, entryType: 'homework', ...patch })
const dialog = page => page.getByRole('dialog')
const current = page => page.locator('.day-page[data-current]')
async function data(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key) }
async function waitData(page, predicate, arg) {
  await page.waitForFunction(({ key, fn, arg }) => {
    const raw = localStorage.getItem(key)
    return raw && (0, eval)(`(${fn})`)(JSON.parse(raw), arg)
  }, { key, fn: predicate.toString(), arg })
}
async function clickNav(page, name) { await page.getByRole('navigation').getByRole('button', { name, exact: true }).click() }
async function close(page) {
  await dialog(page).getByRole('button', { name: 'Закрыть', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
}
async function date(page, value) {
  await current(page).getByRole('button', { name: 'Календарь', exact: true }).click()
  const d = new Date(value + 'T12:00:00+03:00')
  const label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })
  await dialog(page).getByRole('button', { name: new RegExp(`^${label}`) }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await page.waitForFunction(value => document.querySelector('.day-page[data-current] time[datetime]')?.getAttribute('datetime') === value, value)
}
async function download(page, button) {
  const pending = page.waitForEvent('download')
  await button.click()
  const result = await pending
  const stream = await result.createReadStream()
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return { filename: result.suggestedFilename(), text }
}
async function touch(target, type, points, changed = points) {
  await target.evaluate((element, { type, points, changed }) => {
    const make = p => new Touch({ identifier: p.id ?? 1, target: element, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y })
    element.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: points.map(make), targetTouches: points.map(make), changedTouches: changed.map(make) }))
  }, { type, points, changed })
}

function scenario(name, run, options = {}) {
  test(name, { timeout: 45_000 }, async t => {
    if (options.devOnly && !process.env.DZ_DEV_BASE_URL) {
      t.skip('Пилот агента доступен только в DEV; укажи DZ_DEV_BASE_URL для изолированного mock-теста.')
      return
    }
    const targetURL = options.devOnly ? process.env.DZ_DEV_BASE_URL : baseURL
    const context = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined, timezoneId: 'Europe/Moscow', locale: 'ru-RU', reducedMotion: 'reduce', ...(options.context || {}) })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2026-10-01T12:00:00+03:00') })
    await page.addInitScript(({ raw, key, legacy, standalone }) => {
      if (standalone) Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
      if (!sessionStorage.getItem('audit-seeded')) {
        localStorage.setItem(key, raw)
        localStorage.setItem('dz:data', legacy)
        sessionStorage.setItem('audit-seeded', 'yes')
      }
    }, { raw: options.raw ?? JSON.stringify(options.data ?? fresh()), key, legacy: 'Прежняя база — не трогать', standalone: Boolean(options.standalone) })
    try {
      await page.goto(targetURL + (options.query || ''), { waitUntil: 'domcontentloaded' })
      await page.getByRole('navigation').waitFor()
      await run({ page, context, t })
      assert.deepEqual(errors, [], 'Не должно быть необработанных ошибок приложения')
      assert.equal(await page.evaluate(() => localStorage.getItem('dz:data')), 'Прежняя база — не трогать')
    } catch (error) {
      await mkdir('audit/browser-failures', { recursive: true })
      await page.screenshot({ path: `audit/browser-failures/${name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 90)}.png` }).catch(() => {})
      throw error
    } finally { await context.close() }
  })
}

scenario('Три вкладки, создание, правка, удаление с отменой и повторный запуск', async ({ page }) => {
  assert.equal(await current(page).locator('time[datetime]').getAttribute('datetime'), today)
  await clickNav(page, 'Задачи')
  await page.getByRole('button', { name: 'Задание', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Что нужно сделать' }).fill('Новый личный отчёт')
  await dialog(page).getByRole('button', { name: 'Добавить задание', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await waitData(page, d => d.tasks.length === 1)
  const first = (await data(page)).tasks[0]
  assert.equal(first.subjectId, '')
  assert.equal(first.due, today)
  await page.locator('.task-content').filter({ hasText: 'Новый личный отчёт' }).click()
  await dialog(page).getByRole('textbox', { name: 'Что нужно сделать' }).fill('Изменённый отчёт')
  await dialog(page).getByRole('button', { name: 'Сохранить', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await waitData(page, d => d.tasks[0]?.title === 'Изменённый отчёт')
  await page.locator('.task-content').filter({ hasText: 'Изменённый отчёт' }).click()
  await dialog(page).getByRole('button', { name: 'Удалить задание', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await waitData(page, d => d.tasks.length === 0)
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await waitData(page, d => d.tasks.length === 1)
  assert.equal((await data(page)).tasks[0].id, first.id)
  await page.reload()
  assert.equal((await data(page)).tasks[0].title, 'Изменённый отчёт')
  await clickNav(page, 'Настройки')
  await page.getByRole('button', { name: /^Предметы/ }).click()
  assert.equal(await dialog(page).locator('.subject-row').count(), 11)
  await close(page)
  await page.getByRole('button', { name: /^О приложении/ }).click()
  await dialog(page).getByText('Для iPhone и компьютера').waitFor()
  await close(page)
})

scenario('Выполнение и история: отмена, правка выполненного и возвращение в работу', async ({ page }) => {
  await clickNav(page, 'Задачи')
  await page.getByRole('button', { name: 'Выполнить: Личный отчёт', exact: true }).click()
  await waitData(page, d => d.tasks[0].done)
  await page.getByRole('button', { name: 'Отменить выполнение', exact: true }).click()
  await waitData(page, d => !d.tasks[0].done)
  await page.getByRole('button', { name: 'Выполнить: Личный отчёт', exact: true }).click()
  await page.getByRole('button', { name: 'История', exact: true }).click()
  await dialog(page).locator('.task-content').filter({ hasText: 'Личный отчёт' }).click()
  await dialog(page).getByRole('textbox', { name: 'Что нужно сделать' }).fill('Правка из истории')
  await dialog(page).getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByRole('dialog', { name: 'Выполненные задания', exact: true }).waitFor()
  await waitData(page, d => d.tasks[0].title === 'Правка из истории' && d.tasks[0].done)
  await dialog(page).getByRole('button', { name: 'Вернуть: Правка из истории', exact: true }).click()
  await waitData(page, d => !d.tasks[0].done)
  await close(page)
  await page.getByText('Правка из истории', { exact: true }).waitFor()
}, { data: { ...fresh(), tasks: [personal()] } })

scenario('Выбранный день, второй семинар физики и следующая дата сохраняют привязку', async ({ page }) => {
  await date(page, '2026-10-05')
  await current(page).getByRole('button', { name: 'Добавить задание: Физика, Семинар, 15:55', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Что нужно сделать' }).fill('Семинар к открытому дню')
  await dialog(page).getByRole('button', { name: 'Добавить задание', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await waitData(page, d => d.tasks.length === 1)
  assert.equal((await data(page)).tasks[0].due, '2026-10-05')
  assert.equal((await data(page)).tasks[0].lessonId, 'pn-4')
  assert.equal(await current(page).getByText('Семинар к открытому дню', { exact: true }).count(), 1)
  await current(page).getByText('Семинар к открытому дню', { exact: true }).click()
  await dialog(page).getByRole('button', { name: /Семинар после него/ }).click()
  await dialog(page).getByRole('button', { name: 'Сохранить', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await waitData(page, d => d.tasks[0].due === '2026-10-19')
  await clickNav(page, 'Задачи')
  await clickNav(page, 'Расписание')
  assert.equal(await current(page).locator('time[datetime]').getAttribute('datetime'), today)
})

scenario('Две лабораторные требуют выбора; заметка с лекции остаётся заметкой', async ({ page }) => {
  await date(page, '2026-10-12')
  await page.getByRole('button', { name: 'Задание', exact: true }).click()
  await dialog(page).getByRole('button', { name: /^Предмет/ }).click()
  await dialog(page).getByRole('button', { name: 'Физика', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Лаба', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Что нужно сделать' }).fill('Вторая лабораторная')
  assert.equal(await dialog(page).getByRole('button', { name: 'Добавить задание', exact: true }).isEnabled(), false)
  await dialog(page).getByRole('button', { name: /Лаба.*17:35/ }).click()
  await dialog(page).getByRole('button', { name: 'Добавить задание', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await waitData(page, d => d.tasks[0]?.lessonId === 'pn-5')
  assert.equal((await data(page)).tasks[0].due, '2026-10-12')
  await current(page).getByRole('button', { name: 'Добавить заметку: Физика, Лекция, 14:05', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Взять тетрадь по физике')
  await dialog(page).getByRole('button', { name: 'Добавить заметку', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await waitData(page, d => d.tasks.length === 2)
  const note = (await data(page)).tasks[1]
  assert.equal(note.entryType, 'note')
  assert.equal(note.subjectId, 'phys')
  assert.equal(note.lessonId, undefined)
  assert.equal(await current(page).locator('.day-extra').getByText('Взять тетрадь по физике', { exact: true }).count(), 1)
})

scenario('Темы, скорость, сворачивание и экспорт сохраняют задания и прежний ключ', async ({ page }) => {
  await clickNav(page, 'Настройки')
  for (const [label, theme, color] of [['Тёмная', 'dark', '#17191d'], ['Чёрная', 'black', '#000000'], ['Светлая', 'light', '#fdfcfb']]) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await waitData(page, (d, theme) => d.theme === theme, theme)
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), color)
  }
  await page.getByRole('button', { name: 'Плавно', exact: true }).click()
  await waitData(page, d => d.animationSpeed === 'smooth')
  await clickNav(page, 'Задачи')
  await page.locator('.day-heading').click()
  await waitData(page, d => d.collapsed.includes('2026-10-01'))
  await page.reload()
  await clickNav(page, 'Задачи')
  assert.equal(await page.locator('.day-heading').getAttribute('aria-expanded'), 'false')
  await clickNav(page, 'Настройки')
  await page.getByRole('button', { name: /^Резервная копия/ }).click()
  const exported = await download(page, dialog(page).getByRole('button', { name: 'Скачать копию данных', exact: true }))
  assert.equal(exported.filename, 'dz-2026-10-01.json')
  assert.deepEqual(JSON.parse(exported.text), await data(page))
  assert.equal(JSON.parse(exported.text).tasks[0].title, 'Личный отчёт')
}, { data: { ...fresh(), tasks: [personal()] } })

scenario('Замена и очистка примеров не удаляют личную запись даже с похожим ID и текстом', async ({ page }) => {
  await clickNav(page, 'Настройки')
  await page.getByRole('button', { name: /^Для бета-тестеров/ }).click()
  await dialog(page).getByRole('button', { name: 'Добавить тестовые задания', exact: true }).click()
  await waitData(page, d => d.tasks.some(t => t.testBatchId))
  const first = await data(page)
  const oldBatch = first.tasks.find(t => t.testBatchId).testBatchId
  assert.deepEqual(first.tasks.find(t => !t.testBatchId), personal('Решить задачи 3–7', { id: 'batch-personal' }))
  await dialog(page).getByRole('button', { name: 'Добавить тестовые задания', exact: true }).click()
  await waitData(page, (d, oldBatch) => d.tasks.some(t => t.testBatchId && t.testBatchId !== oldBatch), oldBatch)
  assert.equal((await data(page)).tasks.length, first.tasks.length)
  await close(page)
  await page.reload()
  await clickNav(page, 'Настройки')
  await page.getByRole('button', { name: /^Для бета-тестеров/ }).click()
  await dialog(page).getByRole('button', { name: /^Удалить тестовые задания/ }).click()
  await waitData(page, d => d.tasks.length === 1)
  assert.deepEqual((await data(page)).tasks, [personal('Решить задачи 3–7', { id: 'batch-personal' })])
}, { data: { ...fresh(), tasks: [personal('Решить задачи 3–7', { id: 'batch-personal' })] } })

scenario('Повреждённое сохранение не затирается, исходные байты можно скачать', async ({ page }) => {
  await page.getByRole('alert').waitFor()
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{broken')
  const exported = await download(page, page.getByRole('button', { name: 'Скачать резервную копию', exact: true }))
  assert.equal(exported.text, '{broken')
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Не писать поверх сломанной базы')
  await dialog(page).getByRole('button', { name: 'Добавить заметку', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{broken')
}, { raw: '{broken' })

scenario('Отказ записи: новое задание остаётся в памяти и включается в резервную копию', async ({ page }) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = function () { throw new DOMException('Переполнено', 'QuotaExceededError') }
  })
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Не потерять при переполнении')
  await dialog(page).getByRole('button', { name: 'Добавить заметку', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await page.getByRole('alert').waitFor()
  assert.equal((await data(page)).tasks.length, 0)
  const exported = await download(page, page.getByRole('button', { name: 'Скачать резервную копию', exact: true }))
  assert.equal(JSON.parse(exported.text).tasks[0].title, 'Не потерять при переполнении')
})

scenario('Демо изолировано от рабочей базы при создании и смене оформления', async ({ page }) => {
  const before = await page.evaluate(key => localStorage.getItem(key), key)
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Только демонстрация')
  await dialog(page).getByRole('button', { name: 'Добавить заметку', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await clickNav(page, 'Настройки')
  await page.getByRole('button', { name: 'Чёрная', exact: true }).click()
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before)
}, { query: '?demo=1&fixture=empty', data: { ...fresh(), tasks: [personal()] } })

scenario('Редактор на малой высоте: сохранение доступно, Escape и фокус не теряются', async ({ page }) => {
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Короткая высота экрана')
  await page.setViewportSize({ width: 390, height: 400 })
  const save = dialog(page).getByRole('button', { name: 'Добавить заметку', exact: true })
  await page.waitForFunction(() => {
    const button = document.querySelector('dialog[open] .editor-footer .primary-button')
    if (!button) return false
    const bounds = button.getBoundingClientRect()
    return bounds.y >= 0 && bounds.bottom <= 400
  })
  const bounds = await save.boundingBox()
  assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 400, 'Кнопка сохранения должна быть внутри видимой области')
  await save.click()
  await dialog(page).waitFor({ state: 'hidden' })
  await waitData(page, d => d.tasks.length === 1)
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await page.keyboard.press('Tab')
  assert.equal(await dialog(page).evaluate(element => element.contains(document.activeElement)), true)
  await page.keyboard.press('Escape')
  await dialog(page).waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('button', { name: 'Заметка', exact: true }).evaluate(element => element === document.activeElement), true)
})

scenario('Полночь обновляет текущий день; просмотр другой даты остаётся на выбранном дне', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-10-01T23:59:59+03:00'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.clock.runFor(61_000)
  await page.waitForFunction(() => document.querySelector('.day-page[data-current] time[datetime]')?.getAttribute('datetime') === '2026-10-02')
  await date(page, '2026-10-05')
  await page.clock.setSystemTime(new Date('2026-10-03T01:00:00+03:00'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  assert.equal(await current(page).locator('time[datetime]').getAttribute('datetime'), '2026-10-05')
})

scenario('Офлайн: перезагрузка и новое окно открывают кешированную PWA и сохранённое задание', async ({ page, context }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
  })
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('navigation').waitFor()
  await clickNav(page, 'Задачи')
  await page.getByText('Личный отчёт', { exact: true }).waitFor()
  const second = await context.newPage()
  await second.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await clickNav(second, 'Задачи')
  await second.getByText('Личный отчёт', { exact: true }).waitFor()
  assert.equal((await data(second)).tasks[0].title, 'Личный отчёт')
  await context.setOffline(false)
}, { data: { ...fresh(), tasks: [personal()] } })

scenario('Два окна одного origin добавляют записи без потери и сразу видят изменения друг друга', async ({ page, context }) => {
  const second = await context.newPage()
  await second.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await second.getByRole('navigation').waitFor()
  const addNote = async (target, title) => {
    await target.getByRole('button', { name: 'Заметка', exact: true }).click()
    await dialog(target).getByRole('textbox', { name: 'Текст заметки' }).fill(title)
    await dialog(target).getByRole('button', { name: 'Добавить заметку', exact: true }).click()
    await dialog(target).waitFor({ state: 'hidden' })
  }
  await addNote(page, 'Запись из первого окна')
  await waitData(page, d => d.tasks.some(t => t.title === 'Запись из первого окна'))
  await addNote(second, 'Запись из второго окна')
  await waitData(second, d => d.tasks.some(t => t.title === 'Запись из второго окна'))
  assert.deepEqual((await data(page)).tasks.map(t => t.title).sort(), ['Запись из первого окна', 'Запись из второго окна'].sort())
  await current(page).getByText('Запись из второго окна', { exact: true }).waitFor()
  await current(second).getByText('Запись из первого окна', { exact: true }).waitFor()
})

scenario('Нажатие календаря и пары открывает форму без ожидания анимации', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await date(page, '2026-10-05')
  await page.clock.pauseAt(new Date('2026-10-01T12:05:00+03:00'))
  await current(page).getByRole('button', { name: 'Календарь', exact: true }).click()
  assert.equal(await page.getByRole('dialog', { name: 'Выбрать день', exact: true }).count(), 1)
  await dialog(page).getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.clock.runFor(1000)
  await dialog(page).waitFor({ state: 'hidden' })
  const lesson = current(page).getByRole('button', { name: 'Добавить задание: Физика, Семинар, 15:55', exact: true })
  await lesson.click()
  assert.equal(await dialog(page).count(), 1, 'Открытие не зависит от продвижения часов анимации')
  await dialog(page).getByRole('textbox', { name: 'Что нужно сделать' }).fill('Тап без задержки')
  await dialog(page).getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.clock.runFor(1000)
  await dialog(page).waitFor({ state: 'hidden' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.locator('.day-track').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m41), 0)
})

scenario('Вертикальная инерция не измеряет размеры на каждом кадре и не превращает скролл в тап', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await date(page, '2026-10-05')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const scroll = current(page).locator('.app-scroll')
  await scroll.evaluate(element => {
    window.auditSizeReads = 0
    for (const property of ['scrollHeight', 'clientHeight']) {
      const getter = Object.getOwnPropertyDescriptor(Element.prototype, property).get
      Object.defineProperty(element, property, { configurable: true, get() { window.auditSizeReads++; return getter.call(this) } })
    }
    element.scrollTop = 100
  })
  await touch(scroll, 'touchstart', [{ x: 250, y: 300 }])
  await page.clock.runFor(16)
  await touch(scroll, 'touchmove', [{ x: 250, y: 240 }])
  await page.clock.runFor(16)
  await touch(scroll, 'touchend', [], [{ x: 250, y: 240 }])
  const reads = await page.evaluate(() => window.auditSizeReads)
  const before = await scroll.evaluate(element => element.scrollTop)
  await page.clock.runFor(120)
  assert(await scroll.evaluate(element => element.scrollTop) > before, 'После отпускания работает инерция')
  assert.equal(await page.evaluate(() => window.auditSizeReads), reads, 'Кадры используют измеренную границу')
  const lesson = current(page).getByRole('button', { name: 'Добавить задание: Физика, Семинар, 15:55', exact: true })
  await lesson.evaluate(element => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
  assert.equal(await dialog(page).count(), 0, 'Ghost click после скролла подавлен')
  await touch(scroll, 'touchstart', [{ x: 250, y: 250 }])
  await touch(scroll, 'touchend', [], [{ x: 250, y: 250 }])
  await lesson.evaluate(element => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
  assert.equal(await dialog(page).count(), 1, 'Следующий отдельный тап срабатывает сразу')
})

scenario('Один диагональный жест не двигает одновременно список и страницу дня', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await date(page, '2026-10-05')
  const scroll = current(page).locator('.app-scroll')
  await scroll.evaluate(element => { element.scrollTop = 100 })
  const before = await scroll.evaluate(element => element.scrollTop)
  assert(before > 0)
  await touch(scroll, 'touchstart', [{ x: 250, y: 300 }])
  await touch(scroll, 'touchmove', [{ x: 250, y: 293 }])
  await touch(scroll, 'touchmove', [{ x: 30, y: 280 }])
  const after = await scroll.evaluate(element => element.scrollTop)
  const shifted = await page.locator('.day-track').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m41)
  assert(!(Math.abs(after - before) > 1 && Math.abs(shifted) > 1), `Вертикальный сдвиг ${after - before}, горизонтальный ${shifted}`)
  await touch(scroll, 'touchcancel', [], [{ x: 30, y: 280 }])
  await scroll.evaluate(element => { element.scrollTop = 100 })
  await touch(scroll, 'touchstart', [{ x: 250, y: 300 }])
  await touch(scroll, 'touchmove', [{ x: 250, y: 288 }])
  await touch(scroll, 'touchmove', [{ x: 30, y: 280 }])
  assert.equal(await page.locator('.day-track').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m41), 0)
  await touch(scroll, 'touchcancel', [], [{ x: 30, y: 280 }])
})

scenario('Внешнее изменение не затирается окном с несохранённой локальной записью', async ({ page, context }) => {
  const second = await context.newPage()
  await second.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await second.getByRole('navigation').waitFor()
  const addNote = async (target, title) => {
    await target.getByRole('button', { name: 'Заметка', exact: true }).click()
    await dialog(target).getByRole('textbox', { name: 'Текст заметки' }).fill(title)
    await dialog(target).getByRole('button', { name: 'Добавить заметку', exact: true }).click()
    await dialog(target).waitFor({ state: 'hidden' })
  }
  await page.evaluate(() => {
    window.auditOriginalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function () { throw new DOMException('Переполнено', 'QuotaExceededError') }
  })
  await addNote(page, 'Несохранённая локальная')
  await page.getByRole('alert').waitFor()
  await addNote(second, 'Сохранённая внешняя')
  await waitData(second, d => d.tasks.some(t => t.title === 'Сохранённая внешняя'))
  await page.evaluate(() => { Storage.prototype.setItem = window.auditOriginalSetItem })
  await addNote(page, 'Ещё одна локальная')
  assert.deepEqual((await data(second)).tasks.map(t => t.title), ['Сохранённая внешняя'])
  const exported = await download(page, page.getByRole('button', { name: 'Скачать резервную копию', exact: true }))
  assert(JSON.parse(exported.text).tasks.some(t => t.title === 'Несохранённая локальная'))
})

scenario('Reduced-motion останавливает вертикальную инерцию и сразу доводит горизонтальный follow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await date(page, '2026-10-05')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const scroll = current(page).locator('.app-scroll')
  await scroll.evaluate(element => { element.scrollTop = 50 })
  await touch(scroll, 'touchstart', [{ x: 200, y: 300 }])
  await page.clock.runFor(20)
  await touch(scroll, 'touchmove', [{ x: 200, y: 280 }])
  await page.clock.runFor(20)
  await touch(scroll, 'touchmove', [{ x: 200, y: 240 }])
  await touch(scroll, 'touchend', [], [{ x: 200, y: 240 }])
  await page.clock.runFor(16)
  await page.evaluate(() => {
    window.auditReducedDelivered = false
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = event => {
      if (event.matches) { window.auditReducedDelivered = true; query.removeEventListener('change', changed) }
    }
    query.addEventListener('change', changed)
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => window.auditReducedDelivered)
  const stopped = await scroll.evaluate(element => element.scrollTop)
  await page.clock.runFor(150)
  assert.equal(await scroll.evaluate(element => element.scrollTop), stopped)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await touch(scroll, 'touchstart', [{ x: 200, y: 200 }])
  await touch(scroll, 'touchmove', [{ x: 100, y: 200 }])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.day-track')).transform).m41 === -100)
  const shifted = await page.locator('.day-track').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m41)
  assert.equal(shifted, -100)
  await touch(scroll, 'touchcancel', [], [{ x: 100, y: 200 }])
})

scenario('Перетаскивание из поля на подложку не теряет черновик; отдельный тап снаружи закрывает', async ({ page }) => {
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  const input = dialog(page).getByRole('textbox', { name: 'Текст заметки' })
  await input.fill('Черновик до сохранения')
  const bounds = await input.boundingBox()
  await page.mouse.move(bounds.x + 10, bounds.y + 10)
  await page.mouse.down()
  await page.mouse.move(10, 5)
  await page.mouse.up()
  assert.equal(await dialog(page).count(), 1)
  assert.equal(await input.inputValue(), 'Черновик до сохранения')
  await page.mouse.click(10, 5)
  await dialog(page).waitFor({ state: 'hidden' })
  assert.equal((await data(page)).tasks.length, 0)
})

scenario('Старая заметка с годом 0001 открывает правильный месяц и листает календарь', async ({ page }) => {
  await clickNav(page, 'Задачи')
  await page.locator('.task-content').filter({ hasText: 'Ранняя дата' }).click()
  await dialog(page).locator('.month-title').getByText('Январь 1', { exact: true }).waitFor()
  assert.equal(await dialog(page).getByRole('button', { name: /^1 января 1 г/ }).getAttribute('aria-pressed'), 'true')
  await dialog(page).getByRole('button', { name: 'Следующий месяц', exact: true }).click()
  await dialog(page).locator('.month-title').getByText('Февраль 1', { exact: true }).waitFor()
  await close(page)
  assert.equal((await data(page)).tasks[0].due, '0001-01-01')
}, { data: { ...fresh(), tasks: [personal('Ранняя дата', { subjectId: '', entryType: 'note', due: '0001-01-01' })] } })

scenario('Новое касание во время доведения дня не запускает вертикальную прокрутку', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 })
  await clickNav(page, 'Настройки')
  await clickNav(page, 'Расписание')
  await date(page, '2026-10-05')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const scroll = current(page).locator('.app-scroll')
  await scroll.evaluate(element => { element.scrollTop = 100 })
  await touch(scroll, 'touchstart', [{ x: 250, y: 300 }])
  await touch(scroll, 'touchmove', [{ x: 30, y: 300 }])
  await page.clock.runFor(30)
  await touch(scroll, 'touchend', [], [{ x: 30, y: 300 }])
  await page.clock.runFor(30)
  assert(Math.abs(await page.locator('.day-track').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m41)) > 1)
  const before = await scroll.evaluate(element => element.scrollTop)
  await touch(scroll, 'touchstart', [{ x: 250, y: 300, id: 2 }])
  await touch(scroll, 'touchmove', [{ x: 250, y: 280, id: 2 }])
  await page.clock.runFor(20)
  assert.equal(await scroll.evaluate(element => element.scrollTop), before)
  await touch(scroll, 'touchend', [], [{ x: 250, y: 280, id: 2 }])
  await page.clock.runFor(400)
})

scenario('Два окна: 20 одновременных сохранений не теряют ни одну запись', async ({ page, context }) => {
  const second = await context.newPage()
  await second.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await second.getByRole('navigation').waitFor()
  for (let round = 0; round < 20; round++) {
    const firstTitle = `Одновременная A ${round}`
    const secondTitle = `Одновременная B ${round}`
    await Promise.all([page, second].map(target => target.getByRole('button', { name: 'Заметка', exact: true }).click()))
    await Promise.all([
      dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill(firstTitle),
      dialog(second).getByRole('textbox', { name: 'Текст заметки' }).fill(secondTitle),
    ])
    await Promise.all([page, second].map(target => dialog(target).getByRole('button', { name: 'Добавить заметку', exact: true }).click()))
    await Promise.all([page, second].map(target => dialog(target).waitFor({ state: 'hidden' })))
    const saved = await data(page)
    assert(saved.tasks.some(t => t.title === firstTitle), `Раунд ${round}: потеряна A, сохранилось ${saved.tasks.length} записей`)
    assert(saved.tasks.some(t => t.title === secondTitle), `Раунд ${round}: потеряна B, сохранилось ${saved.tasks.length} записей`)
  }
  assert.equal((await data(page)).tasks.length, 40)
})

scenario('Без Web Locks изменения доступны в копии сеанса, исходное сохранение не перезаписывается', async ({ page }) => {
  const original = await page.evaluate(key => localStorage.getItem(key), key)
  await page.evaluate(() => Object.defineProperty(Navigator.prototype, 'locks', { configurable: true, get: () => undefined }))
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Копия без поддержки блокировки')
  await dialog(page).getByRole('button', { name: 'Добавить заметку', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await page.getByRole('alert').waitFor()
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), original)
  const exported = await download(page, page.getByRole('button', { name: 'Скачать резервную копию', exact: true }))
  assert.equal(JSON.parse(exported.text).tasks[0].title, 'Копия без поддержки блокировки')
})

scenario('Ожидающее блокировку сохранение и повторная отправка формы создают только одну запись', async ({ page, context }) => {
  const holder = await context.newPage()
  await holder.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await holder.getByRole('navigation').waitFor()
  await holder.evaluate(key => {
    navigator.locks.request(key, () => {
      window.auditLockHeld = true
      return new Promise(resolve => { window.auditReleaseLock = resolve })
    })
  }, key)
  await holder.waitForFunction(() => window.auditLockHeld)
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Единственная запись после ожидания')
  await dialog(page).locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit() })
  await dialog(page).locator('form[inert]').waitFor()
  assert.equal((await data(page)).tasks.length, 0)
  await holder.evaluate(() => window.auditReleaseLock())
  await dialog(page).waitFor({ state: 'hidden' })
  await waitData(page, d => d.tasks.length === 1)
  assert.equal((await data(page)).tasks[0].title, 'Единственная запись после ожидания')
  await holder.close()
})

scenario('Позднее завершение старого сохранения не закрывает новый черновик после Escape', async ({ page, context }) => {
  const holder = await context.newPage()
  await holder.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await holder.getByRole('navigation').waitFor()
  await holder.evaluate(key => {
    navigator.locks.request(key, () => {
      window.auditLockHeld = true
      return new Promise(resolve => { window.auditReleaseLock = resolve })
    })
  }, key)
  await holder.waitForFunction(() => window.auditLockHeld)
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Ранее отправленная запись')
  await dialog(page).locator('form').evaluate(form => form.requestSubmit())
  await dialog(page).locator('form[inert]').waitFor()
  await page.keyboard.press('Escape')
  await dialog(page).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Новый несохранённый черновик')
  await holder.evaluate(() => window.auditReleaseLock())
  await waitData(page, d => d.tasks[0]?.title === 'Ранее отправленная запись')
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).waitFor()
  assert.equal(await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).inputValue(), 'Новый несохранённый черновик')
  assert.equal((await data(page)).tasks.length, 1)
  await holder.close()
})

scenario('Удаление ждёт блокировку, повторный клик и новый черновик не теряют данные', async ({ page, context }) => {
  const holder = await context.newPage()
  await holder.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await holder.getByRole('navigation').waitFor()
  await holder.evaluate(key => {
    navigator.locks.request(key, () => {
      window.auditLockHeld = true
      return new Promise(resolve => { window.auditReleaseLock = resolve })
    })
  }, key)
  await holder.waitForFunction(() => window.auditLockHeld)
  await clickNav(page, 'Задачи')
  await page.locator('.task-content').filter({ hasText: 'Личный отчёт' }).click()
  await dialog(page).getByRole('button', { name: 'Удалить задание', exact: true }).evaluate(button => { button.click(); button.click() })
  await dialog(page).locator('form[inert]').waitFor()
  assert.equal((await data(page)).tasks.length, 1)
  await page.keyboard.press('Escape')
  await dialog(page).waitFor({ state: 'hidden' })
  await clickNav(page, 'Расписание')
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Черновик после удаления')
  await holder.evaluate(() => window.auditReleaseLock())
  await waitData(page, d => d.tasks.length === 0)
  assert.equal(await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).inputValue(), 'Черновик после удаления')
  await holder.close()
}, { data: { ...fresh(), tasks: [personal()] } })

scenario('Пакет агента: отказ сохранения оставляет черновик, повтор сохраняет один раз без нового разбора', async ({ page }) => {
  let calls = 0
  await page.route('**/agent/parse', async route => {
    calls++
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: [{ subjectId: 'prob', title: 'Решить Э-104', deadlineText: '2 октября', deadline: { type: 'date', value: '2026-10-02', kind: '' }, question: '' }] }) })
  })
  await clickNav(page, 'Настройки')
  await page.getByRole('button', { name: /^Для бета-тестеров/ }).click()
  await page.getByRole('button', { name: /Текстом или голосом/ }).click()
  await page.getByRole('textbox', { name: 'Текст заданий' }).fill('По теорверу решить Э-104 к 2 октября')
  await page.getByRole('button', { name: 'Разобрать задания', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить задания (1)', exact: true }).waitFor()
  await page.evaluate(() => {
    window.auditSavedLocks = navigator.locks
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: () => Promise.reject(new Error('Отказ доступа к блокировке в тесте')) } })
  })
  await page.getByRole('button', { name: 'Добавить задания (1)', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Не удалось сохранить. Черновики остались здесь.' }).waitFor()
  assert.equal(await page.locator('.smart-input fieldset textarea').inputValue(), 'Решить Э-104')
  assert.equal((await data(page)).tasks.length, 0)
  assert.equal(await page.getByRole('button', { name: 'Добавить задания (1)', exact: true }).isEnabled(), true)
  await page.evaluate(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: window.auditSavedLocks }))
  await page.getByRole('button', { name: 'Добавить задания (1)', exact: true }).click()
  await waitData(page, d => d.tasks.length === 1)
  await dialog(page).waitFor({ state: 'hidden' })
  assert.equal((await data(page)).tasks[0].title, 'Решить Э-104')
  assert.equal(calls, 1)
}, { devOnly: true })

scenario('Отложенная смена темы в mock standalone сохраняет новый черновик и не перезагружает его', async ({ page, context }) => {
  const holder = await context.newPage()
  await holder.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await holder.getByRole('navigation').waitFor()
  await holder.evaluate(key => {
    navigator.locks.request(key, () => {
      window.auditLockHeld = true
      return new Promise(resolve => { window.auditReleaseLock = resolve })
    })
  }, key)
  await holder.waitForFunction(() => window.auditLockHeld)
  await clickNav(page, 'Настройки')
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click()
  await clickNav(page, 'Расписание')
  await page.getByRole('button', { name: 'Заметка', exact: true }).click()
  await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).fill('Черновик во время смены темы')
  await holder.evaluate(() => window.auditReleaseLock())
  await waitData(page, d => d.theme === 'dark')
  assert.equal(await dialog(page).getByRole('textbox', { name: 'Текст заметки' }).inputValue(), 'Черновик во время смены темы')
  assert.equal(new URL(page.url()).searchParams.get('screen'), null)
  assert.equal((await data(page)).tasks.length, 0)
  await holder.close()
}, { standalone: true })

scenario('Обычная смена темы в mock standalone сохраняет данные и выполняет предусмотренный reload', async ({ page }) => {
  await clickNav(page, 'Настройки')
  await page.getByRole('button', { name: 'Тёмная', exact: true }).click()
  await page.waitForURL(/screen=settings/)
  await page.getByRole('heading', { name: 'Настройки', exact: true }).waitFor()
  assert.equal((await data(page)).theme, 'dark')
  assert.equal((await data(page)).tasks[0].title, 'Личный отчёт')
}, { standalone: true, data: { ...fresh(), tasks: [personal()] } })
