// Более короткая инерция: скорость затухает в e раз за 140 мс.
export function scrollStep(velocity: number, elapsed: number) {
  const decay = Math.exp(-Math.max(0, elapsed) / 140)
  return { distance: velocity * 140 * (1 - decay), velocity: velocity * decay }
}
