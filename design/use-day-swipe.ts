import { useLayoutEffect, useRef, type RefObject } from 'react'
import { motionDuration } from './motion'
import { daySwipeTarget } from './swipe'

// Три соседних дня стоят рядом; движение пальца меняет только transform.
export function useDaySwipe(viewportRef: RefObject<HTMLDivElement | null>, trackRef: RefObject<HTMLDivElement | null>, date: string, enabled: boolean, changeDay: (direction: -1 | 1) => void) {
  const change = useRef(changeDay)
  const reset = useRef<() => void>(() => {})
  useLayoutEffect(() => { change.current = changeDay })
  useLayoutEffect(() => { reset.current() }, [date])
  useLayoutEffect(() => {
    const viewport = viewportRef.current, track = trackRef.current
    const root = viewport?.closest<HTMLElement>('[data-swipe-days]')
    if (!enabled || !viewport || !track || !root) return
    let pointer: number | null = null
    let startX = 0, startY = 0, base = 0, offset = 0
    let axis: 'x' | 'y' | null = null
    let suppressClick = false
    let animation: Animation | null = null
    let samples: { x: number; time: number }[] = []
    const width = () => viewport.clientWidth
    const transform = (x: number) => `translate3d(${x - width()}px, 0, 0)`
    const draw = (x: number) => { offset = Math.max(-width(), Math.min(width(), x)); track.style.transform = transform(offset) }
    const stopAnimation = () => {
      if (animation) { animation.onfinish = null; animation.cancel(); animation = null }
    }
    const release = () => {
      if (pointer !== null && root.hasPointerCapture(pointer)) root.releasePointerCapture(pointer)
      pointer = null
    }
    const clear = () => {
      stopAnimation(); release(); axis = null; offset = 0
      track.style.transform = ''; delete root.dataset.dayDragging
      for (const el of track.querySelectorAll<HTMLElement>('[aria-hidden="true"] .app-scroll')) el.scrollTop = 0
    }
    reset.current = clear
    const settle = (direction: -1 | 0 | 1) => {
      const from = offset, to = -direction * width()
      stopAnimation(); draw(to)
      const finish = () => {
        animation = null
        if (direction) change.current(direction)
        else clear()
      }
      const duration = motionDuration(true)
      if (!duration || Math.abs(to - from) < 1) { finish(); return }
      const running = track.animate([{ transform: transform(from) }, { transform: transform(to) }], {
        duration, easing: 'cubic-bezier(.2,.7,.2,1)',
      })
      animation = running
      running.onfinish = finish
    }
    const sample = (event: PointerEvent) => {
      samples.push({ x: event.clientX, time: event.timeStamp })
      samples = samples.filter(item => event.timeStamp - item.time <= 100)
    }
    const cancel = () => {
      if (pointer === null) return
      suppressClick = axis !== null
      release()
      if (axis === 'x') settle(0)
      axis = null
    }
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') { suppressClick = false; return }
      if (pointer !== null || !event.isPrimary) { cancel(); return }
      const target = event.target instanceof Element ? event.target : null
      if (!target || !root.contains(target) || target.closest('dialog, input, textarea, select, [contenteditable]')) return
      suppressClick = false
      // Новое касание может подхватить ещё движущуюся страницу без скачка.
      const interrupted = Boolean(animation)
      if (animation) {
        const position = new DOMMatrixReadOnly(getComputedStyle(track).transform).m41 + width()
        stopAnimation(); draw(position)
      }
      pointer = event.pointerId; startX = event.clientX; startY = event.clientY
      base = offset; axis = interrupted ? 'x' : null; samples = []; sample(event)
      if (interrupted) root.setPointerCapture(pointer)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      const dx = event.clientX - startX, dy = event.clientY - startY
      if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y'
        if (axis === 'x') {
          root.dataset.dayDragging = 'true'
          root.setPointerCapture(event.pointerId)
        }
      }
      if (axis !== 'x') return
      if (event.cancelable) event.preventDefault()
      sample(event); draw(base + dx)
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      const horizontal = axis === 'x'
      suppressClick = axis !== null
      if (horizontal) {
        if (event.cancelable) event.preventDefault()
        draw(base + event.clientX - startX)
        const recent = samples[0]
        const elapsed = recent ? event.timeStamp - recent.time : 0
        const velocity = elapsed > 0 && elapsed <= 100 ? (event.clientX - recent.x) / elapsed : 0
        release(); settle(daySwipeTarget(offset, width(), velocity))
      } else release()
      axis = null
    }
    const cancelled = (event: PointerEvent) => { if (event.pointerId === pointer) cancel() }
    const lostCapture = (event: PointerEvent) => { if (event.target === root) cancelled(event) }
    const click = (event: MouseEvent) => {
      if (!root.contains(event.target as Node) || event.detail === 0) return
      if (suppressClick || animation) {
        event.preventDefault(); event.stopPropagation(); suppressClick = false
      }
    }
    const contextMenu = (event: Event) => {
      if (root.contains(event.target as Node)) event.preventDefault()
    }
    const resize = () => { clear(); suppressClick = true }
    const hidden = () => { if (document.hidden) cancel() }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = () => { if (reduced.matches && animation) animation.finish() }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, { capture: true, passive: false })
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', cancelled, true)
    document.addEventListener('click', click, true)
    root.addEventListener('contextmenu', contextMenu)
    root.addEventListener('lostpointercapture', lostCapture)
    window.addEventListener('resize', resize)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', hidden)
    reduced.addEventListener('change', reduce)
    return () => {
      clear(); reset.current = () => {}
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', cancelled, true)
      document.removeEventListener('click', click, true)
      root.removeEventListener('contextmenu', contextMenu)
      root.removeEventListener('lostpointercapture', lostCapture)
      window.removeEventListener('resize', resize)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', hidden)
      reduced.removeEventListener('change', reduce)
    }
  }, [enabled, viewportRef, trackRef])
}
