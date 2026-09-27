import { useEffect } from 'react'
import { motionDuration } from './motion'

// Только состоявшийся клик: свайп по кнопке не вызывает ложного нажатия.
export function useButtonFeedback() {
  useEffect(() => {
    const animations = new Map<HTMLElement, Animation>()
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return
      const button = event.target.closest<HTMLElement>('button, a.outline-button')
      if (!button || button.matches(':disabled, .lesson-open')) return
      const duration = motionDuration()
      if (!duration) return
      animations.get(button)?.cancel()
      const animation = button.animate([
        { scale: '1', opacity: 1 }, { scale: '.96', opacity: .72, offset: .25 }, { scale: '1', opacity: 1 },
      ], { duration, easing: 'cubic-bezier(.2, .7, .2, 1)' })
      animations.set(button, animation)
      animation.finished.then(() => { if (animations.get(button) === animation) animations.delete(button) }, () => {})
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const cancel = () => { for (const animation of animations.values()) animation.cancel(); animations.clear() }
    const reduce = () => { if (reduced.matches) cancel() }
    document.addEventListener('click', click)
    reduced.addEventListener('change', reduce)
    return () => { document.removeEventListener('click', click); reduced.removeEventListener('change', reduce); cancel() }
  }, [])
}
