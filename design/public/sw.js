// Сборка подставляет версию и полный список файлов. Данные заданий здесь не хранятся.
const VERSION = 'dev' /*__VERSION__*/
const FILES = [] /*__PRECACHE__*/
const SCOPE = self.registration.scope
const CACHE = `dz-next-shell:${SCOPE}:${VERSION}`
const urls = FILES.map(file => new URL(file, SCOPE).href)
const shell = new URL('index.html', SCOPE).href
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (urls.length) {
      const cache = await caches.open(CACHE)
      await cache.addAll(urls.map(url => new Request(url, { cache: 'reload' })))
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
  if (request.mode === 'navigate' && (page === SCOPE || page === shell)) {
    event.respondWith((async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3500)
      try {
        const response = await fetch(request, { signal: controller.signal })
        if (response.ok) return response
        throw new Error('App unavailable')
      } catch {
        const cached = await (await caches.open(CACHE)).match(shell)
        return cached || Response.error()
      } finally { clearTimeout(timer) }
    })())
  } else if (urls.includes(page)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(page)) || fetch(request))())
  }
})
