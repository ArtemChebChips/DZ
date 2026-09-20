if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('./sw.js', location.href), { updateViaCache: 'none' })
    .then(registration => {
      registration.update().catch(() => {})
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {})
      })
    }).catch(error => console.warn('Не удалось проверить обновление приложения', error))
}
