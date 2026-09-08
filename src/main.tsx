import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'
import './lib/theme.ts'

/**
 * iOS сам за обновлениями не следит: приложение с домашнего экрана может
 * месяцами крутить старую версию из кеша. Поэтому проверяем обновление при
 * каждом запуске и раз в полчаса, а новую версию применяем сразу.
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    void registration.update()
    setInterval(() => void registration.update(), 30 * 60 * 1000)
    // Возврат в приложение из фона — тоже повод проверить обновление.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
