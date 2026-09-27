import { useEffect, useRef } from 'react'
import { motionDuration } from './motion'

// Только состоявшийся клик: свайп по кнопке не вызывает ложного нажатия.
export function useButtonFeedback() {
  useEffect(() => {
    const animations = new Map<HTMLElement, Animation>()
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return
      const button = event.target.closest<HTMLElement>('button, a, summary')
      if (!button || button.matches('.lesson-open')) return
      const duration = motionDuration()
      if (!duration) return
      animations.get(button)?.cancel()
      const animation = button.animate([
        { scale: '1', opacity: 1 }, { scale: '.94', opacity: .68, offset: .3 }, { scale: '1', opacity: 1 },
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

// Даём нажатию завершиться перед открытием/закрытием. Сохранение и
// скачивание не задерживаем: им нужна активация пользователя.
export function usePressAction() {
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; action: () => void } | null>(null)
  useEffect(() => {
    const cancel = () => { if (pending.current) clearTimeout(pending.current.timer); pending.current = null }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    const hidden = () => { if (document.hidden) cancel() }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = () => { if (reduced.matches) { const action = pending.current?.action; cancel(); action?.() } }
    document.addEventListener('pointerdown', cancel, true)
    document.addEventListener('keydown', key, true)
    document.addEventListener('visibilitychange', hidden)
    reduced.addEventListener('change', reduce)
    return () => {
      cancel()
      document.removeEventListener('pointerdown', cancel, true)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('visibilitychange', hidden)
      reduced.removeEventListener('change', reduce)
    }
  }, [])
  return (action: () => void) => () => {
    if (pending.current) clearTimeout(pending.current.timer)
    const duration = motionDuration()
    if (!duration) { pending.current = null; action(); return }
    pending.current = { action, timer: setTimeout(() => { pending.current = null; action() }, duration) }
  }
}
