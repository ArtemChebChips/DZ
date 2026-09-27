// Возврат пальца к исходной точке отменяет перелистывание, даже после половины страницы.
export function daySwipeTarget(offset: number, width: number, velocity: number): -1 | 0 | 1 {
  if (width <= 0 || Math.abs(offset) < 35) return 0
  const returning = offset * velocity < 0 && Math.abs(velocity) > .35
  if (returning) return 0
  if (Math.abs(offset) < Math.max(60, width * .28) && Math.abs(velocity) < .45) return 0
  return offset < 0 ? 1 : -1
}
