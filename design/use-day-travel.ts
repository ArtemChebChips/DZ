import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { addDays, diffDays } from '../src/lib/dates'
import { motionDuration } from './motion'

type Journey = { dates: string[]; direction: number }

// Готовим страницы один раз. Саму ленту двигает браузер, без React на каждом кадре.
export function useDayTravel(viewport: RefObject<HTMLDivElement | null>, track: RefObject<HTMLDivElement | null>, date: string, selectDay: (date: string) => void, enabled: boolean) {
  const [journey, setJourney] = useState<Journey | null>(null)
  const current = useRef({ date, selectDay })
  useLayoutEffect(() => { current.current = { date, selectDay } })
  useLayoutEffect(() => {
    const element = track.current, container = viewport.current
    if (!journey || !element || !container) return
    if (!enabled) { setJourney(null); return }
    const width = container.getBoundingClientRect().width
    const last = journey.dates.length - 1
    const motion = motionDuration(true)
    // Настройка могла измениться между созданием journey и этим рендером.
    // При скрытом viewport нет расстояния, по которому можно отменять переход.
    if (!motion || width <= 0) { current.current.selectDay(journey.dates[last]); setJourney(null); return }
    const duration = Math.min(1500, Math.max(650, motion * 3))
    const animation = element.animate([
      { transform: 'translate3d(0, 0, 0)' },
      { transform: `translate3d(${-journey.direction * last * width}px, 0, 0)` },
    ], { duration, easing: 'cubic-bezier(.35, 0, .25, 1)', fill: 'both' })
    let finished = false
    const finish = (index = last) => {
      if (finished) return
      finished = true
      flushSync(() => { current.current.selectDay(journey.dates[index]); setJourney(null) })
    }
    const cancel = () => {
      const offset = new DOMMatrixReadOnly(getComputedStyle(element).transform).m41
      finish(Math.max(0, Math.min(last, Math.round(Math.abs(offset) / width))))
    }
    animation.finished.then(() => finish(), () => {})
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
      finished = true; animation.cancel(); resize.disconnect()
      document.removeEventListener('pointerdown', cancel, true)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('visibilitychange', hidden)
      reduced.removeEventListener('change', reduce)
    }
  }, [journey, enabled, viewport, track])
  const travel = (next: string) => {
    const distance = diffDays(current.current.date, next)
    if (!distance || !motionDuration()) { current.current.selectDay(next); return }
    const steps = Math.min(Math.abs(distance), 7)
    setJourney({ direction: Math.sign(distance), dates: Array.from({ length: steps + 1 }, (_, i) => addDays(current.current.date, Math.round(distance * i / steps))) })
  }
  const pages = journey?.dates.map((day, i) => ({ date: day, position: i * journey.direction, preview: i !== 0 }))
  return [travel, journey !== null, pages] as const
}
