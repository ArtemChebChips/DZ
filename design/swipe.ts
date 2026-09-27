export function daySwipeTarget(offset: number, width: number, velocity: number): -1 | 0 | 1 {
  if (width <= 0 || Math.abs(offset) < 35) return 0
  const farEnough = Math.abs(offset) >= Math.max(60, width * .35)
  const flick = Math.abs(velocity) >= .5 && offset * velocity > 0
  return farEnough || flick ? (offset < 0 ? 1 : -1) : 0
}

export function swipeSettleDuration(distance: number, width: number, duration: number): number {
  if (!duration || width <= 0) return 0
  return Math.max(180, duration * (.7 + .8 * Math.sqrt(Math.min(1, distance / width))))
}

// Непрерывное доведение: стартовая скорость ограничена, к концу скорость нулевая.
export function swipeSettleProgress(t: number, slope: number): number {
  return -2 * t ** 3 + 3 * t ** 2 + slope * (t ** 3 - 2 * t ** 2 + t)
}
