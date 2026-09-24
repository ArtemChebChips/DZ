import { useEffect } from 'react'

// Не передаём жест документу, когда список/диалог уже дошёл до края.
// body остаётся обычным: его фиксация ломала установленное приложение iPhone.
export function useScrollBoundary() {
  useEffect(() => {
    let previousY = 0
    const start = (event: TouchEvent) => { previousY = event.touches[0]?.clientY ?? 0 }
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !(event.target instanceof Element)) return
      const y = event.touches[0].clientY
      const delta = y - previousY
      previousY = y
      if (!delta) return
      // textarea может прокручиваться внутри диалога; затем проверяем сам диалог.
      for (let el: Element | null = event.target; el; el = el.parentElement) {
        if (!(el instanceof HTMLElement) || !el.matches('[data-scroll-region], dialog, textarea, .app-nav')) continue
        const style = getComputedStyle(el)
        if (!['auto', 'scroll'].includes(style.overflowY)) continue
        const remaining = el.scrollHeight - el.clientHeight - el.scrollTop
        if ((delta < 0 && remaining > 1) || (delta > 0 && el.scrollTop > 0)) return
      }
      if (event.cancelable) event.preventDefault()
    }
    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
    }
  }, [])
}
