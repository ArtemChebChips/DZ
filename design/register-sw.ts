// Dev и демонстрация не заменяют worker рабочего приложения.
if (import.meta.env.PROD && new URLSearchParams(location.search).get('demo') !== '1' && 'serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register(new URL('./sw.js', location.href), { updateViaCache: 'none' })
    .then(registration => {
      let lastCheck = 0
      const check = () => {
        if (!navigator.onLine || document.visibilityState !== 'visible' || Date.now() - lastCheck < 60000) return
        lastCheck = Date.now()
        registration.update().catch(() => {})
      }
      check()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
    }).catch(error => console.warn('Не удалось проверить обновление приложения', error))
  // Регистрация не конкурирует с первым кадром приложения.
  if (document.readyState === 'complete') void register()
  else window.addEventListener('load', () => { void register() }, { once: true })
}
