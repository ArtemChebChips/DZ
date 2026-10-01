import { useEffect } from 'react'

// Подсветка начинается с касания, действие — с подтверждённого click.
// Перемещение отменяет подсветку: прокрутка и свайп не открывают карточку.
export function useButtonFeedback() {
  useEffect(() => {
    let active: HTMLElement | null = null
    let origin: { x: number; y: number; id: number } | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const buttonAt = (target: EventTarget | null) => {
      const button = target instanceof Element ? target.closest<HTMLElement>('button, a, summary') : null
      if (!button || button.matches(':disabled, .app-nav button, .segmented button')) return null
      // Карточка отвечает целиком, включая скруглённые края и отступы.
      if (button.matches('.task-content')) return button.closest<HTMLElement>('.task-row')
      if (button.matches('.lesson-open')) return button.closest<HTMLElement>('.lesson')
      return button
    }
    const clear = () => {
      clearTimeout(timer)
      active?.removeAttribute('data-pressed')
      active = null; origin = null
    }
    const show = (element: HTMLElement) => {
      clearTimeout(timer)
      if (active !== element) active?.removeAttribute('data-pressed')
      active = element; element.dataset.pressed = 'true'
    }
    const release = () => { clearTimeout(timer); timer = setTimeout(clear, 100) }
    const down = (event: PointerEvent) => {
      clear()
      const element = buttonAt(event.target)
      if (!element || !event.isPrimary) return
      origin = { x: event.clientX, y: event.clientY, id: event.pointerId }
      show(element)
    }
    const move = (event: PointerEvent) => {
      if (origin?.id === event.pointerId && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) clear()
    }
    const up = (event: PointerEvent) => {
      if (origin?.id !== event.pointerId) return
      origin = null; release()
    }
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      const element = buttonAt(event.target)
      if (element) { show(element); release() }
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear()
      if (event.key === 'Enter' || event.key === ' ') {
        const element = buttonAt(event.target)
        if (element) show(element)
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
    document.addEventListener('scroll', clear, true)
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
      document.removeEventListener('scroll', clear, true)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('blur', clear)
    }
  }, [])
}

// Подсветка уже видна под пальцем. Открытие формы не ждёт её завершения
// и остаётся в событии пользователя, в том числе для скачивания/фокуса.
export function usePressAction() {
  return (action: () => void) => action
}
