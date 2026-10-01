import { useEffect, useRef } from 'react'
import { motionDuration } from './motion'

// Состояние под пальцем; движение отменяет подсветку и не имитирует клик.
export function useButtonFeedback() {
  useEffect(() => {
    let active: HTMLElement | null = null
    let origin: { x: number; y: number; id: number } | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const buttonAt = (target: EventTarget | null) => {
      const button = target instanceof Element ? target.closest<HTMLElement>('button, a, summary') : null
      return button && !button.matches('.lesson-open, .app-nav button, .segmented button') ? button : null
    }
    const clear = () => {
      clearTimeout(timer)
      active?.removeAttribute('data-pressed')
      active = null; origin = null
    }
    const show = (button: HTMLElement) => {
      clearTimeout(timer)
      if (active !== button) active?.removeAttribute('data-pressed')
      active = button; button.dataset.pressed = 'true'
    }
    const release = () => { clearTimeout(timer); timer = setTimeout(clear, Math.max(180, motionDuration())) }
    const down = (event: PointerEvent) => {
      clear()
      const button = buttonAt(event.target)
      if (!button || button.matches(':disabled') || !event.isPrimary) return
      active = button; origin = { x: event.clientX, y: event.clientY, id: event.pointerId }
      // Маленькая пауза не даёт кнопке мигать при начале прокрутки.
      if (event.pointerType === 'touch') timer = setTimeout(() => show(button), 60)
      else show(button)
    }
    const move = (event: PointerEvent) => {
      if (origin?.id === event.pointerId && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) clear()
    }
    const up = (event: PointerEvent) => {
      if (origin?.id !== event.pointerId) return
      if (active) show(active)
      origin = null; release()
    }
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      const button = buttonAt(event.target)
      if (button) { show(button); release() }
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear()
      if (event.key === 'Enter' || event.key === ' ') {
        const button = buttonAt(event.target)
        if (button && !button.matches(':disabled')) show(button)
      }
    }
    const hidden = () => { if (document.hidden) clear() }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', clear, true)
    document.addEventListener('click', click)
    document.addEventListener('keydown', key, true)
    document.addEventListener('keyup', release, true)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('blur', clear)
    return () => {
      clear()
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', clear, true)
      document.removeEventListener('click', click)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('keyup', release, true)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('blur', clear)
    }
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
    document.addEventListener('scroll', cancel, true)
    window.addEventListener('blur', cancel)
    reduced.addEventListener('change', reduce)
    return () => {
      cancel()
      document.removeEventListener('pointerdown', cancel, true)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('visibilitychange', hidden)
      document.removeEventListener('scroll', cancel, true)
      window.removeEventListener('blur', cancel)
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
