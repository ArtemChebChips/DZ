// CSS и Web Animations читают одну длительность; reduced motion всегда важнее.
export function milliseconds(value: string): number {
  const time = value.trim()
  const amount = Number.parseFloat(time)
  return Number.isFinite(amount) ? amount * (time.endsWith('ms') ? 1 : time.endsWith('s') ? 1000 : 1) : 0
}

export function motionDuration(height = false): number {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 0
  const value = getComputedStyle(document.documentElement).getPropertyValue(height ? '--motion-height' : '--motion-duration')
  return milliseconds(value)
}
