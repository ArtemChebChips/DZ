// Прокрутка и листание дня должны выбрать одну ось в одном событии.
// Разные пороги позволяли короткой диагонали запустить оба жеста одновременно.
export function gestureAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return null
  return Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
}

// Небольшое отставание (~17 мс), одинаковое на экранах 60 и 120 Гц.
export function swipeFollow(current: number, target: number, elapsed: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, elapsed) / 17))
}

export function daySwipeTarget(offset: number, width: number, velocity: number): -1 | 0 | 1 {
  if (width <= 0 || Math.abs(offset) < 35) return 0
  const farEnough = Math.abs(offset) >= Math.max(60, width * .35)
  const flick = Math.abs(velocity) >= .5 && offset * velocity > 0
  return farEnough || flick ? (offset < 0 ? 1 : -1) : 0
}

export function swipeSettleDuration(distance: number, width: number, duration: number): number {
  if (!duration || width <= 0) return 0
  // Свайп — прямой жест: не задерживаем следующий взмах настройкой плавности.
  return .7 * Math.min(180, Math.max(100, duration * Math.min(1, distance / width)))
}

// Непрерывное доведение: стартовая скорость ограничена, к концу скорость нулевая.
export function swipeSettleProgress(t: number, slope: number): number {
  return -2 * t ** 3 + 3 * t ** 2 + slope * (t ** 3 - 2 * t ** 2 + t)
}
