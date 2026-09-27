import { useEffect } from 'react'
import { scrollStep } from './scroll-motion'

export function useGentleScroll() {
  useEffect(() => {
    let region: HTMLElement | null = null, id: number | null = null
    let x = 0, y = 0, top = 0, target = 0, expected = 0
    let axis: 'x' | 'y' | null = null, frame = 0, suppress = false
    let samples: { y: number; time: number }[] = []
    const stop = () => { cancelAnimationFrame(frame); frame = 0 }
    const draw = (value: number) => {
      if (!region?.isConnected) { stop(); return }
      region.scrollTop = Math.max(0, Math.min(region.scrollHeight - region.clientHeight, value))
      expected = region.scrollTop
    }
    const start = (e: TouchEvent) => {
      stop(); id = null; axis = null; suppress = false; region = null
      if (e.touches.length !== 1 || !(e.target instanceof Element) || e.target.closest('input, textarea, select, [contenteditable]')) return
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
      if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 6) axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
      if (axis !== 'y' || e.defaultPrevented) return
      if (!e.cancelable) { id = null; stop(); return }
      e.preventDefault(); suppress = true
      target = top - dy
      samples.push({ y: t.clientY, time: e.timeStamp })
      samples = samples.filter(s => e.timeStamp - s.time <= 90)
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(target) })
    }
    const end = (e: TouchEvent) => {
      const t = Array.from(e.changedTouches).find(t => t.identifier === id)
      if (!t || axis !== 'y' || !suppress || !region) { id = null; return }
      id = null; stop(); if (e.cancelable) e.preventDefault()
      draw(target)
      const sample = samples[0], last = samples.at(-1)
      const elapsed = sample && last ? last.time - sample.time : 0
      const pause = last ? e.timeStamp - last.time : Infinity
      let velocity = elapsed > 0 && pause < 100 ? Math.max(-2.5, Math.min(2.5, (sample.y - last!.y) / elapsed)) * Math.exp(-pause / 140) : 0
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
      let previous = performance.now()
      const tick = (time: number) => {
        frame = 0
        if (!region?.isConnected || Math.abs(region.scrollTop - expected) > 1) return
        const step = scrollStep(velocity, time - previous), before = region.scrollTop
        previous = time; velocity = step.velocity; draw(before + step.distance)
        if (Math.abs(velocity) > .02 && Math.abs(region.scrollTop - before) > .1) frame = requestAnimationFrame(tick)
      }
      if (Math.abs(velocity) > .02) frame = requestAnimationFrame(tick)
    }
    const cancel = () => { stop(); id = null }
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
    window.addEventListener('resize', cancel)
    return () => {
      cancel()
      document.removeEventListener('touchstart', start, true); document.removeEventListener('touchmove', move, true); document.removeEventListener('touchend', end, true)
      document.removeEventListener('touchcancel', cancel, true); document.removeEventListener('click', click, true); document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('wheel', cancel); document.removeEventListener('keydown', cancel, true); document.removeEventListener('visibilitychange', cancel); window.removeEventListener('resize', cancel)
    }
  }, [])
}
