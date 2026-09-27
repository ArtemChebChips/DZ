import { useLayoutEffect, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { motionDuration } from './motion'
import { daySwipeTarget, swipeFollow, swipeSettleDuration, swipeSettleProgress } from './swipe'

// Один offset и для пальца, и для доведения: без переключения CSS/WAAPI-слоёв.
export function useDaySwipe(viewportRef: RefObject<HTMLDivElement | null>, trackRef: RefObject<HTMLDivElement | null>, date: string, enabled: boolean, changeDay: (direction: -1 | 1) => void) {
  const change = useRef(changeDay)
  const reset = useRef<() => void>(() => {})
  useLayoutEffect(() => { change.current = changeDay })
  useLayoutEffect(() => { reset.current() }, [date])
  useLayoutEffect(() => {
    const viewport = viewportRef.current, track = trackRef.current
    const root = viewport?.closest<HTMLElement>('[data-swipe-days]')
    if (!enabled || !viewport || !track || !root) return
    let touchId: number | null = null
    let startX = 0, startY = 0, base = 0, offset = 0
    let width = viewport.getBoundingClientRect().width
    let axis: 'x' | 'y' | null = null
    let suppressClick = false
    let frame: number | null = null
    let finishSettle: (() => void) | null = null
    let samples: { x: number; time: number }[] = []
    let targetOffset = 0
    const draw = (x: number) => {
      offset = Math.max(-width, Math.min(width, x))
      track.style.transform = `translateX(${offset}px)`
    }
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null; finishSettle = null
    }
    const follow = (target: number) => {
      targetOffset = Math.max(-width, Math.min(width, target))
      if (reduced.matches) { draw(targetOffset); return }
      if (frame !== null) return
      let previous = performance.now()
      const tick = (now: number) => {
        frame = null
        draw(swipeFollow(offset, targetOffset, now - previous))
        previous = now
        if (Math.abs(targetOffset - offset) > .1) frame = requestAnimationFrame(tick)
        else draw(targetOffset)
      }
      frame = requestAnimationFrame(tick)
    }
    const clear = () => {
      stop(); touchId = null; axis = null; offset = 0
      track.style.transform = ''; delete root.dataset.dayDragging
      for (const el of track.querySelectorAll<HTMLElement>('[aria-hidden="true"] .app-scroll')) el.scrollTop = 0
    }
    reset.current = clear
    const settle = (direction: -1 | 0 | 1, velocity = 0) => {
      stop()
      const from = offset, to = -direction * width
      const duration = swipeSettleDuration(Math.abs(to - from), width, motionDuration(true))
      const finish = () => {
        stop()
        // Замена содержимого неподвижных слотов и сброс offset — один кадр.
        if (direction) flushSync(() => change.current(direction))
        else clear()
      }
      if (!duration || Math.abs(to - from) < .5) { finish(); return }
      finishSettle = finish
      const started = performance.now()
      const slope = Math.max(0, Math.min(1.2, velocity * duration / (to - from)))
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / duration)
        draw(from + (to - from) * swipeSettleProgress(progress, slope))
        if (progress === 1) finish()
        else frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    const cancel = () => {
      if (touchId === null) return
      suppressClick = axis !== null; touchId = null
      if (axis === 'x') settle(0)
      axis = null
    }
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) { cancel(); return }
      const target = event.target instanceof Element ? event.target : null
      if (!target || !root.contains(target) || target.closest('dialog, input, textarea, select, [contenteditable]')) return
      const touch = event.touches[0], interrupted = finishSettle !== null
      stop(); suppressClick = false
      touchId = touch.identifier; startX = touch.clientX; startY = touch.clientY
      base = offset; axis = interrupted ? 'x' : null
      samples = [{ x: touch.clientX, time: event.timeStamp }]
    }
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1) { cancel(); return }
      const touch = event.touches[0]
      if (touch.identifier !== touchId) return
      const dx = touch.clientX - startX, dy = touch.clientY - startY
      if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 10) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
        if (axis === 'x') root.dataset.dayDragging = 'true'
      }
      if (axis !== 'x') return
      if (event.cancelable) event.preventDefault()
      samples.push({ x: touch.clientX, time: event.timeStamp })
      samples = samples.filter(item => event.timeStamp - item.time <= 100)
      follow(base + dx)
    }
    const end = (event: TouchEvent) => {
      const touch = Array.from(event.changedTouches).find(item => item.identifier === touchId)
      if (!touch) return
      touchId = null; suppressClick = axis !== null
      if (axis === 'x') {
        if (event.cancelable) event.preventDefault()
        // Решение — по пальцу, доведение — из реально показанной позиции.
        // Не догоняем палец скачком в момент отпускания.
        const releasedOffset = Math.max(-width, Math.min(width, base + touch.clientX - startX))
        const recent = samples[0], elapsed = recent ? event.timeStamp - recent.time : 0
        const velocity = elapsed > 0 && elapsed <= 100 ? (touch.clientX - recent.x) / elapsed : 0
        settle(daySwipeTarget(releasedOffset, width, velocity), velocity)
      }
      axis = null
    }
    const pointerDown = (event: PointerEvent) => { if (event.pointerType === 'mouse') suppressClick = false }
    const click = (event: MouseEvent) => {
      if (root.contains(event.target as Node) && event.detail !== 0 && (suppressClick || frame !== null)) {
        event.preventDefault(); event.stopPropagation(); suppressClick = false
      }
    }
    const contextMenu = (event: Event) => { if (root.contains(event.target as Node)) event.preventDefault() }
    const resize = new ResizeObserver(() => {
      const nextWidth = viewport.getBoundingClientRect().width
      // Панели Safari меняют высоту окна во время жеста. Это не отмена свайпа.
      if (Math.abs(nextWidth - width) < .5) return
      width = nextWidth; clear(); suppressClick = true
    })
    resize.observe(viewport)
    const hidden = () => { if (document.hidden) { cancel(); finishSettle?.() } }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = () => { if (reduced.matches) finishSettle?.() }
    document.addEventListener('touchstart', start, { capture: true, passive: true })
    document.addEventListener('touchmove', move, { capture: true, passive: false })
    document.addEventListener('touchend', end, { capture: true, passive: false })
    document.addEventListener('touchcancel', cancel, true)
    document.addEventListener('pointerdown', pointerDown, true)
    document.addEventListener('click', click, true)
    root.addEventListener('contextmenu', contextMenu)
    document.addEventListener('visibilitychange', hidden)
    reduced.addEventListener('change', reduce)
    return () => {
      clear(); reset.current = () => {}; resize.disconnect()
      document.removeEventListener('touchstart', start, true)
      document.removeEventListener('touchmove', move, true)
      document.removeEventListener('touchend', end, true)
      document.removeEventListener('touchcancel', cancel, true)
      document.removeEventListener('pointerdown', pointerDown, true)
      document.removeEventListener('click', click, true)
      root.removeEventListener('contextmenu', contextMenu)
      document.removeEventListener('visibilitychange', hidden)
      reduced.removeEventListener('change', reduce)
    }
  }, [enabled, viewportRef, trackRef])
}
