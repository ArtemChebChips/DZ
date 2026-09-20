// Заменяет прежний app-shell. Сохранённые задания и кеши не удаляются.
// Запросы идут в сеть, чтобы старый ярлык получал текущую версию.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
