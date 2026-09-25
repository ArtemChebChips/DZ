import { useEffect, useRef } from 'react'
import { swipeDay } from './swipe'

// Одно распознавание направления для свайпа дня и защиты от прокрутки документа.
export function useScrollBoundary(onDaySwipe?: (direction: -1 | 1) => void) {
  const callback = useRef(onDaySwipe)
  useEffect(() => { callback.current = onDaySwipe }, [onDaySwipe])
  useEffect(() => {
    let x = 0, y = 0, previousY = 0, dx = 0, dy = 0
    let axis: 'x' | 'y' | null = null
    let swipe = false, ignored = false, suppressUntil = 0
    const start = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      x = touch.clientX; y = previousY = touch.clientY; dx = dy = 0; axis = null
      ignored = event.touches.length !== 1 || x < 24 || x > innerWidth - 24
      const target = event.target instanceof Element ? event.target : null
      swipe = Boolean(callback.current && target?.closest('[data-swipe-days]') && !target.closest('dialog, input, textarea, select, button:not(.task-content):not(.lesson-open)'))
    }
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1) { ignored = true; return }
      if (ignored || !(event.target instanceof Element)) return
      const touch = event.touches[0]
      dx = touch.clientX - x; dy = touch.clientY - y
      const delta = touch.clientY - previousY
      previousY = touch.clientY
      if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 12) axis = swipe && Math.abs(dx) > 1.5 * Math.abs(dy) ? 'x' : 'y'
      if (axis === 'x') { if (event.cancelable) event.preventDefault(); return }
      if (!delta) return
      for (let el: Element | null = event.target; el; el = el.parentElement) {
        if (!(el instanceof HTMLElement) || !el.matches('[data-scroll-region], dialog, textarea, .app-nav')) continue
        if (!['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) continue
        if ((delta < 0 && el.scrollHeight - el.clientHeight - el.scrollTop > 1) || (delta > 0 && el.scrollTop > 0)) return
      }
      if (event.cancelable) event.preventDefault()
    }
    const end = () => {
      if (!ignored && axis === 'x') {
        suppressUntil = performance.now() + 400
        const direction = swipeDay(dx, dy)
        if (direction) callback.current?.(direction)
      }
      axis = null; swipe = false
    }
    const cancel = () => { ignored = true; axis = null; swipe = false }
    const click = (event: MouseEvent) => {
      if (performance.now() < suppressUntil && event.target instanceof Element && event.target.closest('[data-swipe-days]')) {
        event.preventDefault(); event.stopPropagation(); suppressUntil = 0
      }
    }
    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end)
    document.addEventListener('touchcancel', cancel)
    document.addEventListener('click', click, true)
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', cancel)
      document.removeEventListener('click', click, true)
    }
  }, [])
}
