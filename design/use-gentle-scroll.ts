import { useEffect } from 'react'
import { scrollStep, scrollReleaseVelocity } from './scroll-motion'
import { gestureAxis } from './swipe'

export function useGentleScroll() {
  useEffect(() => {
    let region: HTMLElement | null = null, id: number | null = null
    let x = 0, y = 0, top = 0, target = 0, expected = 0
    let axis: 'x' | 'y' | null = null, frame = 0, suppress = false
    let samples: { y: number; time: number }[] = []
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => { cancelAnimationFrame(frame); frame = 0 }
    const draw = (value: number) => {
      if (!region?.isConnected) { stop(); return }
      region.scrollTop = Math.max(0, Math.min(region.scrollHeight - region.clientHeight, value))
      expected = region.scrollTop
    }
    const start = (e: TouchEvent) => {
      stop(); id = null; axis = null; suppress = false; region = null
      if (e.touches.length !== 1 || !(e.target instanceof Element) || e.target.closest('input, textarea, select, [contenteditable]')) return
      // Новое касание может перехватить ещё не завершённый горизонтальный
      // свайп. Его ось уже выбрана: вертикальная инерция не должна включаться
      // параллельно, независимо от порядка document-слушателей после смены вкладки.
      if (e.target.closest('[data-swipe-days][data-day-dragging]')) return
      // Поля редактора сохраняют нативную прокрутку и выделение текста.
      for (let el: Element | null = e.target; el; el = el.parentElement) {
        if (el instanceof HTMLElement && el.matches('.app-scroll, .subject-picker, dialog:not(.editor-sheet)') && el.scrollHeight > el.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) { region = el; break }
      }
      if (!region) return
      const t = e.touches[0]; id = t.identifier; x = t.clientX; y = t.clientY
      top = target = expected = region.scrollTop; samples = [{ y, time: e.timeStamp }]
    }
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1) { stop(); id = null; return }
      const t = e.touches[0]
      if (t.identifier !== id || !region) return
      const dx = t.clientX - x, dy = t.clientY - y
      if (!axis) axis = gestureAxis(dx, dy)
      if (axis !== 'y' || e.defaultPrevented) return
      if (!e.cancelable) { id = null; stop(); return }
      e.preventDefault(); suppress = true
      target = top - dy
      samples.push({ y: t.clientY, time: e.timeStamp })
      // Оставляем точку перед окном: редкие события не должны обнулять скорость.
      while (samples.length > 2 && samples[1].time < e.timeStamp - 100) samples.shift()
      if (reduced.matches) draw(target)
      else if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(target) })
    }
    const end = (e: TouchEvent) => {
      const t = Array.from(e.changedTouches).find(t => t.identifier === id)
      if (!t || axis !== 'y' || !suppress || !region) { id = null; return }
      id = null; stop(); if (e.cancelable) e.preventDefault()
      draw(target)
      let velocity = scrollReleaseVelocity(samples, e.timeStamp)
      if (reduced.matches) return
      let previous = performance.now()
      let position = region.scrollTop
      const tick = (time: number) => {
        frame = 0
        if (!region?.isConnected || Math.abs(region.scrollTop - expected) > 1) return
        const step = scrollStep(velocity, time - previous)
        previous = time; velocity = step.velocity; position += step.distance; draw(position)
        // Не теряем дробные пиксели на 90/120 Гц из-за округления scrollTop.
        if (Math.abs(velocity) > .02 && position > 0 && position < region.scrollHeight - region.clientHeight) frame = requestAnimationFrame(tick)
      }
      if (Math.abs(velocity) > .02) frame = requestAnimationFrame(tick)
    }
    const cancel = () => { stop(); id = null }
    const reduce = () => {
      if (!reduced.matches) return
      stop()
      if (id !== null && axis === 'y') draw(target)
    }
    let width = window.innerWidth
    const resize = () => { if (window.innerWidth !== width) { width = window.innerWidth; cancel() } }
    const click = (e: MouseEvent) => { if (suppress && e.detail !== 0 && region?.contains(e.target as Node)) { e.preventDefault(); e.stopPropagation(); suppress = false } }
    const pointer = (e: PointerEvent) => { if (e.pointerType === 'mouse') { cancel(); suppress = false } }
    document.addEventListener('touchstart', start, { capture: true, passive: true })
    document.addEventListener('touchmove', move, { capture: true, passive: false })
    document.addEventListener('touchend', end, { capture: true, passive: false })
    document.addEventListener('touchcancel', cancel, true)
    document.addEventListener('click', click, true)
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('wheel', cancel, { passive: true })
    document.addEventListener('keydown', cancel, true)
    document.addEventListener('visibilitychange', cancel)
    window.addEventListener('resize', resize)
    reduced.addEventListener('change', reduce)
    return () => {
      cancel()
      document.removeEventListener('touchstart', start, true); document.removeEventListener('touchmove', move, true); document.removeEventListener('touchend', end, true)
      document.removeEventListener('touchcancel', cancel, true); document.removeEventListener('click', click, true); document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('wheel', cancel); document.removeEventListener('keydown', cancel, true); document.removeEventListener('visibilitychange', cancel); window.removeEventListener('resize', resize)
      reduced.removeEventListener('change', reduce)
    }
  }, [])
}
