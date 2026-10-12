// Измерения не содержат заданий и не отправляются по сети.
export const STARTUP_KEY = 'dz-next:startup:v1'
const markNames = ['pageScript', 'themeReadStart', 'themeReadEnd', 'themeParseEnd', 'themeEnd', 'mainModule', 'shellFrameEstimate', 'appRenderStart', 'notebookReadStart', 'notebookReadEnd', 'notebookReady', 'themeApplied', 'interfaceCommit', 'frameEstimate'] as const
type Mark = typeof markNames[number]
type Boot = {
  marks: Partial<Record<Mark, number>>
  hiddenAtStart: boolean
  onlineAtStart: boolean
  themeReadFailed?: boolean
  notebookReadFailed?: boolean
}
declare global { interface Window { __dzBoot?: Boot } }
type WorkerInfo = { version: string; build: string }
type Timings = Record<string, number>
export type StartupReport = {
  schema: 1
  id: string
  version: string
  startedAt: string
  standalone: boolean
  demo: boolean
  onlineAtStart: boolean
  hiddenAtStart: boolean
  hiddenBeforeFrame: boolean
  restoredFromBackForwardCache: boolean
  themeReadFailed: boolean
  notebookReadFailed: boolean
  userAgent: string
  marks: Partial<Record<Mark, number>>
  navigation: Timings | null
  navigationType: string
  shell: { source: string; version: string; build: string; lookupMs: number; workerScriptStart?: number | null; fetchEventStart?: number | null; cacheOpenMs?: number | null; cacheMatchMs?: number | null; responseReady?: number | null } | null
  paint: Timings
  assets: { file: string; duration: number; responseEnd: number; workerStart: number; transferSize: number }[]
  workerAtModule: string | null
  controllerChanged: boolean
  worker: WorkerInfo | null
  workerStatus: string
}
let appVersion = ''
let workerAtModule: string | null = null
let worker: WorkerInfo | null = null
let workerStatus = 'Не проверен'
let controllerChanged = false
let hiddenBeforeFrame = false
let restoredFromBackForwardCache = false
let frameScheduled = false
let scheduledSave = false
let demo = false
let historyError = false
let refreshing: Promise<void> | null = null
const rounded = (value: number) => Math.round(value * 10) / 10
const boot = () => typeof window === 'undefined' ? undefined : window.__dzBoot

export function startupMark(name: Mark) {
  const state = boot()
  if (state && state.marks[name] === undefined) state.marks[name] = performance.now()
}
export function startupReadFailed() { const state = boot(); if (state) state.notebookReadFailed = true }
// Даём браузеру возможность показать фон до синхронного чтения.
// У пустого фона нет FCP: ждать его означало бы задерживать само приложение.
// Два rAF — оценка кадра, не доказательство появления пикселей на экране.
export function afterStartupShellFrame(start: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    startupMark('shellFrameEstimate')
    setTimeout(() => { startupMark('appRenderStart'); start() }, 0)
  }))
}
function controllerPath() {
  const url = navigator.serviceWorker?.controller?.scriptURL
  return url ? new URL(url).pathname : null
}

export function startStartupDiagnostics(version: string) {
  appVersion = version
  demo = new URLSearchParams(location.search).get('demo') === '1'
  startupMark('mainModule')
  workerAtModule = controllerPath()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && boot()?.marks.frameEstimate === undefined) hiddenBeforeFrame = true
  })
  window.addEventListener('pageshow', event => { if (event.persisted) restoredFromBackForwardCache = true })
  navigator.serviceWorker?.addEventListener('controllerchange', () => { controllerChanged = true })
}

// rAF не доказывает показ пикселей. Поэтому это отдельная оценка, не FCP.
export function startupInterfaceReady() {
  startupMark('interfaceCommit')
  if (frameScheduled) return
  frameScheduled = true
  requestAnimationFrame(() => requestAnimationFrame(() => {
    startupMark('frameEstimate')
    if (scheduledSave || demo) return
    scheduledSave = true
    // Чтение истории, запись и обращение к worker идут после первого кадра.
    setTimeout(() => { void refreshStartupReport() }, 1500)
  }))
}

async function inspectWorker() {
  const controller = navigator.serviceWorker?.controller
  if (!controller) { workerStatus = 'Нет управляющего worker'; return }
  workerStatus = 'Ожидание ответа'
  const channel = new MessageChannel()
  await new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve() }
    const timer = setTimeout(() => { workerStatus = 'Нет ответа за 1 с (возможен прежний worker)'; finish() }, 1000)
    channel.port1.onmessage = event => {
      const data = event.data
      if (data?.type !== 'DZ_STARTUP_INFO' || typeof data.version !== 'string' || typeof data.build !== 'string') return
      worker = { version: data.version.slice(0, 40), build: data.build.slice(0, 40) }
      workerStatus = 'Ответ получен'
      finish()
    }
    try { controller.postMessage({ type: 'DZ_STARTUP_INFO' }, [channel.port2]) }
    catch { workerStatus = 'Не удалось запросить worker'; finish() }
  })
}
async function finishReport() {
  try { await inspectWorker() } catch { workerStatus = 'Проверка недоступна' }
  try { saveStartupReport(localStorage, getStartupReport()); historyError = false }
  catch { historyError = true }
  window.dispatchEvent(new Event('dz-startup-report'))
}
// В скрытом Safari rAF может не прийти. Открытие отчёта всё равно проверит
// worker и сохранит доступные числа, не выдавая таймер за измеренный кадр.
export function refreshStartupReport() {
  if (demo) return Promise.resolve()
  if (!refreshing) refreshing = finishReport().finally(() => { refreshing = null })
  return refreshing
}

export function getStartupReport(): StartupReport {
  const state = boot()
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const names = ['workerStart', 'fetchStart', 'requestStart', 'responseStart', 'responseEnd', 'domInteractive', 'domContentLoadedEventEnd', 'loadEventEnd'] as const
  const navigation = nav ? Object.fromEntries(names.map(name => [name, rounded(nav[name])])) : null
  const timing = (name: string) => nav?.serverTiming?.find(entry => entry.name === name)
  const source = timing('dz-source')
  // У worker собственный timeOrigin. Переданные абсолютные отметки приводим
  // к шкале страницы; запуск уже жившего worker может оказаться отрицательным.
  const workerMoment = (name: string) => {
    const value = timing(name)?.description
    return value && Number.isFinite(Number(value)) ? rounded(Number(value) - performance.timeOrigin) : null
  }
  const marks = Object.fromEntries(markNames.flatMap(name => state?.marks[name] === undefined ? [] : [[name, rounded(state.marks[name]!)] ]))
  return {
    schema: 1, id: String(performance.timeOrigin), version: appVersion,
    startedAt: new Date(performance.timeOrigin).toISOString(),
    standalone: Boolean((navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches),
    demo, onlineAtStart: state?.onlineAtStart ?? navigator.onLine, hiddenAtStart: state?.hiddenAtStart ?? document.hidden,
    hiddenBeforeFrame, restoredFromBackForwardCache,
    themeReadFailed: Boolean(state?.themeReadFailed), notebookReadFailed: Boolean(state?.notebookReadFailed),
    userAgent: navigator.userAgent, marks, navigation, navigationType: nav?.type ?? 'Недоступно',
    shell: source ? {
      source: source.description, version: timing('dz-version')?.description ?? '', build: timing('dz-build')?.description ?? '', lookupMs: timing('dz-lookup')?.duration ?? 0,
      workerScriptStart: workerMoment('dz-worker-script'), fetchEventStart: workerMoment('dz-fetch-event'), responseReady: workerMoment('dz-response-ready'),
      cacheOpenMs: timing('dz-cache-open')?.duration ?? null, cacheMatchMs: timing('dz-cache-match')?.duration ?? null,
    } : null,
    paint: Object.fromEntries(performance.getEntriesByType('paint').map(entry => [entry.name, rounded(entry.startTime)])),
    assets: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(entry => {
      const url = new URL(entry.name)
      return url.origin === location.origin && url.pathname.includes('/assets/') && /\.(js|css)$/.test(url.pathname)
    }).slice(0, 12).map(entry => ({ file: new URL(entry.name).pathname.split('/').pop()!, duration: rounded(entry.duration), responseEnd: rounded(entry.responseEnd), workerStart: rounded(entry.workerStart), transferSize: entry.transferSize })),
    workerAtModule, controllerChanged, worker, workerStatus,
  }
}

export function readStartupHistory(storage: Pick<Storage, 'getItem'>): StartupReport[] {
  try {
    const raw = storage.getItem(STARTUP_KEY)
    if (!raw || raw.length > 100_000) return []
    const items: unknown = JSON.parse(raw)
    if (!Array.isArray(items)) return []
    return items.filter((item): item is StartupReport => item?.schema === 1 && typeof item.id === 'string' && typeof item.version === 'string' && typeof item.startedAt === 'string' && item.marks && typeof item.marks === 'object' && Array.isArray(item.assets)).slice(0, 5)
  } catch { return [] }
}
export function saveStartupReport(storage: Pick<Storage, 'getItem' | 'setItem'>, report: StartupReport) {
  if (report.demo) return
  const previous = readStartupHistory(storage).filter(item => item.id !== report.id)
  storage.setItem(STARTUP_KEY, JSON.stringify([report, ...previous].slice(0, 5)))
}
export function startupHistoryUnavailable() { return historyError }
export function markDuration(report: StartupReport, start: Mark, end: Mark) {
  const a = report.marks[start], b = report.marks[end]
  return a === undefined || b === undefined ? null : rounded(b - a)
}
export function formatStartupReport(current: StartupReport, history: StartupReport[]) {
  return 'ДЗ — диагностика запуска\nВремена в мс от начала навигации браузера, не от касания ярлыка. shellFrameEstimate и frameEstimate — приблизительные кадры, не измеренный FCP. В 1.23.61 FCP мог относиться к надписи запуска; с 1.23.62 стартовый фон не содержит текста и не даёт FCP. interfaceCommit и frameEstimate относятся к приложению с данными. Отметки worker приведены к шкале страницы; отрицательный workerScriptStart означает, что worker уже работал до навигации. Нули Navigation Timing могут означать недоступное измерение.\n' + JSON.stringify([current, ...history.filter(item => item.id !== current.id)].slice(0, 5), null, 2)
}
