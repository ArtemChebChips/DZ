import type { Lesson } from '../src/types'

const BREAK_MINUTES = 40
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))

/** Длинные перерывы перед парами; учитываем конец всех перекрывающихся занятий. */
export function lessonBreaks(lessons: Pick<Lesson, 'id' | 'start' | 'end'>[]) {
  const breaks = new Map<string, { start: string; end: string; minutes: number }>()
  let previousEnd = ''
  for (const lesson of [...lessons].sort((a, b) => a.start.localeCompare(b.start))) {
    const gap = minutes(lesson.start) - minutes(previousEnd)
    if (previousEnd && gap > BREAK_MINUTES) breaks.set(lesson.id, { start: previousEnd, end: lesson.start, minutes: gap })
    if (!previousEnd || minutes(lesson.end) > minutes(previousEnd)) previousEnd = lesson.end
  }
  return breaks
}
