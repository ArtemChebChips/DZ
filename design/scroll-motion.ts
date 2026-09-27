// Заметное скольжение после отпускания, с постепенным торможением.
const DECAY_MS = 320
export function scrollStep(velocity: number, elapsed: number) {
  const decay = Math.exp(-Math.max(0, elapsed) / DECAY_MS)
  return { distance: velocity * DECAY_MS * (1 - decay), velocity: velocity * decay }
}

export function scrollReleaseVelocity(samples: { y: number; time: number }[], endTime: number) {
  const first = samples[0], last = samples.at(-1)
  if (!first || !last || last.time <= first.time) return 0
  const pause = Math.max(0, endTime - last.time)
  if (pause >= 180) return 0
  return Math.max(-2.5, Math.min(2.5, (first.y - last.y) / (last.time - first.time))) * Math.exp(-pause / 160)
}
