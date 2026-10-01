// Прокрутка и листание дня должны выбрать одну ось в одном событии.
// Разные пороги позволяли короткой диагонали запустить оба жеста одновременно.
export function gestureAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return null
  return Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
}

// Скорость последних движений, а не средняя за весь жест. Сохраняем точку
// перед окном, чтобы редкие touchmove не обнуляли короткий быстрый взмах.
export function swipeReleaseVelocity(samples: { x: number; time: number }[], x: number, time: number): number {
  const previous = samples.at(-1)
  if (!previous) return 0
  const points = time > previous.time && Math.abs(x - previous.x) > .5 ? [...samples, { x, time }] : samples
  const last = points.at(-1)!
  let first = 0
  while (first + 1 < points.length - 1 && points[first + 1].time < last.time - 80) first++
  const before = points[first], after = points[first + 1]
  const startTime = Math.max(before.time, last.time - 80)
  const startX = after && after.time > before.time
    ? before.x + (after.x - before.x) * (startTime - before.time) / (after.time - before.time)
    : before.x
  const elapsed = last.time - startTime
  const pause = Math.max(0, time - last.time)
  if (elapsed <= 0 || pause >= 160) return 0
  return Math.max(-3, Math.min(3, (last.x - startX) / elapsed)) * Math.exp(-pause / 60)
}

export function daySwipeTarget(offset: number, width: number, velocity: number): -1 | 0 | 1 {
  if (width <= 0 || Math.abs(offset) < 22) return 0
  const threshold = Math.max(56, Math.min(112, width * .22))
  const projected = offset + velocity * 120
  const returning = offset * velocity < 0 && Math.abs(velocity) >= .45 &&
    (offset * projected <= 0 || Math.abs(projected) < threshold * .8)
  if (returning) return 0
  const farEnough = Math.abs(offset) >= threshold
  const flick = Math.abs(velocity) >= .45 && offset * velocity > 0
  return farEnough || flick ? (offset < 0 ? 1 : -1) : 0
}

export function swipeSettleDuration(distance: number, width: number, duration: number): number {
  if (!duration || width <= 0 || distance <= 0) return 0
  // Короткий остаток не должен занимать столько же времени, сколько вся
  // страница. На полной странице оставляем 8–12 кадров при 60 Гц для
  // заметного торможения вместо резкого завершения за несколько кадров.
  const budget = Math.min(190, Math.max(140, duration * .65))
  return Math.max(60, budget * Math.sqrt(Math.min(1, distance / width)))
}

// Непрерывное доведение: стартовая скорость ограничена, к концу скорость нулевая.
export function swipeSettleProgress(t: number, slope: number): number {
  return -2 * t ** 3 + 3 * t ** 2 + slope * (t ** 3 - 2 * t ** 2 + t)
}
