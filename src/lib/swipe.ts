import { useRef } from 'react'

/** Минимальная длина жеста, чтобы не считать свайпом обычный тап. */
const MIN_DISTANCE = 55

/**
 * Горизонтальные свайпы для листания дней.
 * Жест засчитывается, только если он заметно горизонтальнее вертикального —
 * иначе обычная прокрутка списка превращалась бы в смену дня.
 */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onTouchStart(e: React.TouchEvent) {
      const touch = e.touches[0]
      start.current = { x: touch.clientX, y: touch.clientY }
    },
    onTouchEnd(e: React.TouchEvent) {
      const from = start.current
      start.current = null
      if (!from) return

      const touch = e.changedTouches[0]
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y

      if (Math.abs(dx) < MIN_DISTANCE) return
      if (Math.abs(dx) < Math.abs(dy) * 1.5) return

      if (dx < 0) onLeft()
      else onRight()
    },
  }
}
