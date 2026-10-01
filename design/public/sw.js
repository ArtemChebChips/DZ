// Сборка подставляет версию и полный список файлов. Данные заданий здесь не хранятся.
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
})
if (urls.length) self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  const page = url.origin + url.pathname
  // Демонстрация не создаёт и не обновляет рабочую офлайн-копию.
  if (request.mode === 'navigate' && url.searchParams.get('demo') === '1') return
  if (request.mode === 'navigate' && (page === SCOPE || page === shell)) {
    event.respondWith((async () => {
      // Оболочка и её assets принадлежат одной полностью установленной сборке.
      // Проверка нового sw.js идёт отдельно, не задерживая холодный запуск.
      const cached = await (await caches.open(CACHE)).match(shell)
      return cached || fetch(request)
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
