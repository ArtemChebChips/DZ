import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { addDays, diffDays } from '../src/lib/dates'
import { motionDuration } from './motion'

// Программный возврат использует те же три страницы, что и свайп.
// Длинный путь показываем несколькими остановками, без секунд ожидания.
export function useDayTravel(viewport: RefObject<HTMLDivElement | null>, track: RefObject<HTMLDivElement | null>, date: string, selectDay: (date: string) => void, enabled: boolean) {
  const [target, setTarget] = useState<string | null>(null)
  const current = useRef({ date, selectDay })
  useLayoutEffect(() => { current.current = { date, selectDay } })
  useLayoutEffect(() => {
    const element = track.current, container = viewport.current
    if (!target || !element || !container) return
    if (!enabled) { setTarget(null); return }
    const from = current.current.date
    const distance = diffDays(from, target)
    const steps = Math.min(Math.abs(distance), 10)
    const duration = Math.min(1000, motionDuration(true) * (1 + Math.min(steps, 7) / 7))
    if (!steps || !duration) { current.current.selectDay(target); setTarget(null); return }
    const direction = Math.sign(distance)
    const width = container.getBoundingClientRect().width
    let frame = 0, completed = 0
    const started = performance.now()
    const reset = () => { cancelAnimationFrame(frame); element.style.transform = '' }
    const finish = () => {
      reset()
      flushSync(() => { current.current.selectDay(target); setTarget(null) })
    }
    const cancel = () => { reset(); setTarget(null) }
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      if (progress === 1) { finish(); return }
      // Равномерный пролёт и мягкая остановка в последней странице.
      const position = progress * steps
      const step = Math.floor(position)
      if (step !== completed) {
        completed = step
        const travelled = step === steps - 1 ? Math.abs(distance) - 1 : Math.round(step * Math.abs(distance) / steps)
        flushSync(() => current.current.selectDay(addDays(from, direction * travelled)))
      }
      const fraction = position - step
      element.style.transform = `translateX(${-direction * width * (step === steps - 1 ? 1 - (1 - fraction) ** 2 : fraction)}px)`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = () => { if (reduced.matches) finish() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    const hidden = () => { if (document.hidden) finish() }
    const resize = new ResizeObserver(() => { if (Math.abs(container.getBoundingClientRect().width - width) > .5) cancel() })
    resize.observe(container)
    document.addEventListener('pointerdown', cancel, true)
    document.addEventListener('keydown', key, true)
    document.addEventListener('visibilitychange', hidden)
    reduced.addEventListener('change', reduce)
    return () => {
      reset(); resize.disconnect()
      document.removeEventListener('pointerdown', cancel, true)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('visibilitychange', hidden)
      reduced.removeEventListener('change', reduce)
    }
  }, [target, enabled, viewport, track])
  return [(next: string) => {
    if (next === current.current.date || !motionDuration()) current.current.selectDay(next)
    else setTarget(next)
  }, target !== null] as const
}
