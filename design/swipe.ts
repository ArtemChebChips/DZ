export function swipeDay(dx: number, dy: number): -1 | 0 | 1 {
  return Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx < 0 ? 1 : -1) : 0
}
