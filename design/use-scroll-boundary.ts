import { useEffect, useRef } from 'react'
import { swipeDay } from './swipe'
import { motionDuration } from './motion'

// Одно распознавание направления для свайпа дня и защиты от прокрутки документа.
export function useScrollBoundary(onDaySwipe?: (direction: -1 | 1) => void) {
  const callback = useRef(onDaySwipe)
  useEffect(() => { callback.current = onDaySwipe }, [onDaySwipe])
  useEffect(() => {
    let x = 0, y = 0, previousY = 0, dx = 0, dy = 0
    let touchId: number | null = null
    let axis: 'x' | 'y' | null = null
    let swipe = false, ignored = false, suppressClick = false
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) { cancel(); return }
      const touch = event.touches[0]
      touchId = touch.identifier
      x = touch.clientX; y = previousY = touch.clientY; dx = dy = 0; axis = null
      ignored = false; suppressClick = false
      const target = event.target instanceof Element ? event.target : null
      swipe = Boolean(callback.current && target?.closest('[data-swipe-days]') && !target.closest('dialog, input, textarea, select, [contenteditable]'))
    }
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1) { cancel(); return }
      if (ignored || !(event.target instanceof Element)) return
      const touch = event.touches[0]
      if (touch.identifier !== touchId) return
      dx = touch.clientX - x; dy = touch.clientY - y
      const delta = touch.clientY - previousY
      previousY = touch.clientY
      // После начала вертикальной прокрутки не превращаем её в свайп дня.
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
    const end = (event: TouchEvent) => {
      const touch = Array.from(event.changedTouches).find(t => t.identifier === touchId)
      if (!touch) return
      if (!ignored && swipe && axis) {
        suppressClick = true
        if (axis === 'x') {
          if (event.cancelable) event.preventDefault()
          const direction = swipeDay(touch.clientX - x, touch.clientY - y)
          if (direction) callback.current?.(direction)
        }
      }
      touchId = null; axis = null; swipe = false
    }
    const cancel = () => {
      if (swipe) suppressClick = true
      ignored = true; touchId = null; axis = null; swipe = false
    }
    // Новый самостоятельный тап/щелчок не относится к предыдущему жесту.
    // Никакого таймера, блокирующего кнопки на следующие 400 мс.
    const pointerDown = () => { suppressClick = false }
    const pointerCancel = (event: PointerEvent) => { if (event.pointerType === 'touch') cancel() }
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest('[data-swipe-days]')) return
      if (suppressClick && event.detail !== 0) {
        event.preventDefault(); event.stopPropagation(); suppressClick = false
        return
      }
      suppressClick = false
      // Подсветка только подтверждённого нажатия, не начала касания/прокрутки.
      const lesson = target.closest('.lesson-open')
      const duration = motionDuration()
      if (lesson && duration) lesson.animate([
        { backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
        { backgroundColor: 'transparent' },
      ], { duration })
    }
    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end, { passive: false })
    document.addEventListener('touchcancel', cancel)
    document.addEventListener('pointerdown', pointerDown, true)
    document.addEventListener('pointercancel', pointerCancel)
    document.addEventListener('click', click, true)
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', cancel)
      document.removeEventListener('pointerdown', pointerDown, true)
      document.removeEventListener('pointercancel', pointerCancel)
      document.removeEventListener('click', click, true)
    }
  }, [])
}
