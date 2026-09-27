export function isCurrentInterval(date: string, today: string, minute: number, interval: { start: string; end: string }): boolean {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  return date === today && minute >= minutes(interval.start) && minute < minutes(interval.end)
}
