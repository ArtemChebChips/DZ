import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { motionDuration } from './motion'

// Обёртка включает все отступы содержимого и доходит до настоящего нуля.
export function Collapse({ active, hold = false, onEnd, children, className = '' }: { active: boolean; hold?: boolean; onEnd: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const complete = useRef(onEnd)
  useLayoutEffect(() => { complete.current = onEnd })
  useLayoutEffect(() => {
    const el = ref.current!
    const restoring = !active && !hold && Boolean(el.style.height)
    if (!active && !restoring) return
    const height = `${el.getBoundingClientRect().height}px`
    const opacity = getComputedStyle(el).opacity
    const clear = () => { el.style.removeProperty('height'); el.style.removeProperty('opacity') }
    const duration = motionDuration(true)
    if (!duration) { clear(); if (active) complete.current(); return }
    let targetHeight = '0px'
    if (restoring) { clear(); targetHeight = `${el.getBoundingClientRect().height}px` }
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      if (active) complete.current()
      else { animation.cancel(); clear() }
    }
    const animation = el.animate([
      { height, opacity },
      { height: targetHeight, opacity: active ? 0 : 1 },
    ], { duration, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'forwards' })
    animation.finished.then(finish, () => {})
    const fallback = setTimeout(finish, duration + 100)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = () => { if (reduced.matches) finish() }
    reduced.addEventListener('change', reduce)
    return () => {
      reduced.removeEventListener('change', reduce)
      const completed = finished
      finished = true
      clearTimeout(fallback)
      // Когда вся группа уходит во время движения строки, передаём ей текущую
      // высоту строки, не разворачивая её обратно перед измерением группы.
      if (!completed || hold) {
        el.style.height = `${el.getBoundingClientRect().height}px`
        el.style.opacity = getComputedStyle(el).opacity
      }
      animation.cancel()
    }
  }, [active, hold])
  return <div ref={ref} className={`collapse ${className} ${active || hold ? 'collapse-leaving' : ''}`}>{children}</div>
}
