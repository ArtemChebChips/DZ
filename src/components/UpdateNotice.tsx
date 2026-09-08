import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdateNotice() {
  const [error, setError] = useState(false)
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      const update = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void registration?.update().catch(() => {})
      }
      window.addEventListener('online', update)
      document.addEventListener('visibilitychange', update)
    },
  })
  if (!needRefresh) return null
  return (
    <aside className="update-notice" role="status">
      <div><strong>Доступна новая версия</strong><p>{error ? 'Не удалось обновить. Попробуй ещё раз.' : 'Сохрани открытое задание перед обновлением.'}</p></div>
      <div className="flex gap-3"><button className="text-link" onClick={() => { setError(false); void updateServiceWorker(true).catch(() => setError(true)) }}>Обновить</button><button className="text-link" onClick={() => setNeedRefresh(false)}>Позже</button></div>
    </aside>
  )
}
