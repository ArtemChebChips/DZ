// CSS и Web Animations читают одну длительность; reduced motion всегда важнее.
export function motionDuration(height = false): number {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 0
  const value = getComputedStyle(document.documentElement).getPropertyValue(height ? '--motion-height' : '--motion-duration')
  return Number.parseFloat(value) || 0
}
