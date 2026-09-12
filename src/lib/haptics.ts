import { getSettings } from '../store'

/**
 * Короткая вибрация в ответ на действие.
 *
 * Важно: Safari на iOS не поддерживает Vibration API, поэтому на айфоне
 * вызов просто ничего не сделает. На Android работает.
 */
export function haptic(pattern: number | number[] = 8): void {
  try {
    if (!getSettings().haptics) return
    navigator.vibrate?.(pattern)
  } catch {
    // Вибрация — украшение, её отсутствие не должно ломать действие.
  }
}
