import { useLayoutEffect, useRef, type ReactNode } from 'react'

// Обёртка включает все отступы содержимого и доходит до настоящего нуля.
export function Collapse({ active, hold = false, onEnd, children, className = '' }: { active: boolean; hold?: boolean; onEnd: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const complete = useRef(onEnd)
  useLayoutEffect(() => { complete.current = onEnd })
  useLayoutEffect(() => {
    const el = ref.current!
    if (!active) {
      if (!hold) { el.style.removeProperty('height'); el.style.removeProperty('opacity') }
      return
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { complete.current(); return }
    const height = `${el.getBoundingClientRect().height}px`
    const opacity = getComputedStyle(el).opacity
    let finished = false
    const finish = () => { if (!finished) { finished = true; complete.current() } }
    const animation = el.animate([
      { height, opacity },
      { height, opacity: .55, offset: .2 },
      { height: '0px', opacity: 0 },
    ], { duration: 360, easing: 'cubic-bezier(.25, .1, .25, 1)', fill: 'forwards' })
    animation.finished.then(finish, () => {})
    const fallback = setTimeout(finish, 550)
    return () => {
      finished = true
      clearTimeout(fallback)
      // Когда вся группа уходит во время движения строки, передаём ей текущую
      // высоту строки, не разворачивая её обратно перед измерением группы.
      el.style.height = `${el.getBoundingClientRect().height}px`
      el.style.opacity = getComputedStyle(el).opacity
      animation.cancel()
    }
  }, [active, hold])
  return <div ref={ref} className={`collapse ${className} ${active || hold ? 'collapse-leaving' : ''}`}>{children}</div>
}
