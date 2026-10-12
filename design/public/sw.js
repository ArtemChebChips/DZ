// Сборка подставляет версию и полный список файлов. Данные заданий здесь не хранятся.
const SCRIPT_STARTED_AT = performance.timeOrigin + performance.now()
const VERSION = 'dev' /*__VERSION__*/
const BUILD = 'dev' /*__BUILD__*/
const FILES = [] /*__PRECACHE__*/
const SCOPE = self.registration.scope
const PREFIX = `dz-next-shell:${SCOPE}:`
const CACHE = `${PREFIX}${VERSION}:${BUILD}`
const urls = FILES.map(file => new URL(file, SCOPE).href)
const shell = new URL('index.html', SCOPE).href
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (urls.length) {
      const existed = (await caches.keys()).includes(CACHE)
      const cache = await caches.open(CACHE)
      try {
        await cache.addAll(urls.map(url => new Request(url, { cache: 'reload' })))
      } catch (error) {
        // Только неудачная новая копия. Рабочие и соседние кеши не трогаем.
        if (!existed) await caches.delete(CACHE)
        throw error
      }
    }
    await self.skipWaiting()
  })())
})
// Прежние кеши и localStorage не удаляются: открытые вкладки могут использовать старые файлы.
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'DZ_STARTUP_INFO') event.ports?.[0]?.postMessage({ type: 'DZ_STARTUP_INFO', version: VERSION, build: BUILD })
})
if (urls.length) self.addEventListener('fetch', event => {
  const fetchEventAt = performance.timeOrigin + performance.now()
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  const page = url.origin + url.pathname
  // Демонстрация не создаёт и не обновляет рабочую офлайн-копию.
  if (request.mode === 'navigate' && url.searchParams.get('demo') === '1') return
  if (request.mode === 'navigate' && (page === SCOPE || page === shell)) {
    event.respondWith((async () => {
      // Оболочка и её assets принадлежат одной полностью установленной сборке.
      // Проверка нового sw.js идёт отдельно, не задерживая холодный запуск.
      const start = performance.now()
      const cache = await caches.open(CACHE)
      const opened = performance.now()
      const cached = await cache.match(shell)
      const matched = performance.now()
      const lookup = matched - start
      const response = cached || await fetch(request)
      // Числа и версия именно того worker, который отдал HTML. Тело не читаем.
      const headers = new Headers(response.headers)
      headers.append('Server-Timing', `dz-source;desc="${cached ? 'cache' : 'network'}", dz-lookup;dur=${lookup.toFixed(1)}, dz-version;desc="${VERSION}", dz-build;desc="${BUILD}"`)
      headers.append('Server-Timing', `dz-worker-script;desc="${SCRIPT_STARTED_AT.toFixed(1)}", dz-fetch-event;desc="${fetchEventAt.toFixed(1)}", dz-cache-open;dur=${(opened - start).toFixed(1)}, dz-cache-match;dur=${(matched - opened).toFixed(1)}, dz-response-ready;desc="${(performance.timeOrigin + performance.now()).toFixed(1)}"`)
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
    })())
  } else if (urls.includes(page)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(page)) || fetch(request))())
  } else if (url.pathname.startsWith(new URL('assets/', SCOPE).pathname)) {
    event.respondWith((async () => {
      // Новый worker уже управляет прежними вкладками. Их хешированные assets
      // должны оставаться доступны даже после удаления старой сборки с сервера.
      const names = (await caches.keys()).filter(name => name.startsWith(PREFIX))
      for (const name of names) {
        const cached = await (await caches.open(name)).match(page)
        if (cached) return cached
      }
      return fetch(request)
    })())
  }
})
