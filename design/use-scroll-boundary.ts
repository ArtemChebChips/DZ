import { useEffect } from 'react'

// Вертикальная прокрутка остаётся внутри списка/редактора, не двигая документ iOS.
export function useScrollBoundary() {
  useEffect(() => {
    let previousY = 0
    const start = (event: TouchEvent) => { previousY = event.touches[0]?.clientY ?? 0 }
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1 || !(event.target instanceof Element)) return
      const delta = event.touches[0].clientY - previousY
      previousY = event.touches[0].clientY
      if (!delta) return
      for (let el: Element | null = event.target; el; el = el.parentElement) {
        if (!(el instanceof HTMLElement) || !el.matches('[data-scroll-region], dialog, textarea, .app-nav')) continue
        if (!['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) continue
        if ((delta < 0 && el.scrollHeight - el.clientHeight - el.scrollTop > 1) || (delta > 0 && el.scrollTop > 0)) return
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
