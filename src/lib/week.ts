import type { Lesson } from '../types'
import { addDays, diffDays, mondayOf, weekdayOf } from './dates'

export type Parity = 'num' | 'denom'

/**
 * Чётность недели, к которой относится дата.
 * Считается от якоря — понедельника недели, которая точно числитель.
 * Якорь надёжнее «даты начала семестра»: его можно переставить одной кнопкой,
 * если расписание сдвинули или каникулы съели неделю.
 */
export function parityOf(iso: string, anchorMonday: string): Parity {
  const weeks = Math.round(diffDays(anchorMonday, mondayOf(iso)) / 7)
  // Остаток от отрицательного в JS отрицательный, поэтому нормализуем.
  const even = (((weeks % 2) + 2) % 2) === 0
  return even ? 'num' : 'denom'
}

export function parityLabel(p: Parity): string {
  return p === 'num' ? 'Числитель' : 'Знаменатель'
}

export function parityShort(p: Parity): string {
  return p === 'num' ? 'Ч' : 'З'
}

export function parityOfLessonLabel(p: Lesson['parity']): string {
  if (p === 'both') return 'каждую неделю'
  return p === 'num' ? 'числитель' : 'знаменатель'
}

function matches(lesson: Lesson, weekday: number, parity: Parity): boolean {
  if (lesson.weekday !== weekday) return false
  return lesson.parity === 'both' || lesson.parity === parity
}

/** Пары на конкретную дату, отсортированные по времени начала. */
export function lessonsOn(iso: string, lessons: Lesson[], anchorMonday: string): Lesson[] {
  const wd = weekdayOf(iso)
  if (wd === 7) return []
  const p = parityOf(iso, anchorMonday)
  return lessons
    .filter((l) => matches(l, wd, p))
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** Четырёх недель хватает, чтобы найти пару даже у предмета раз в две недели. */
const HORIZON_DAYS = 60

/**
 * Ближайшие даты занятий по предмету начиная с fromISO.
 * Ради этой функции всё и затевалось: для предмета раз в две недели
 * «следующая пара» — это через две недели, а не через одну.
 */
export function nextLessonDates(
  subjectId: string,
  fromISO: string,
  lessons: Lesson[],
  anchorMonday: string,
  count = 2,
  options: { inclusive?: boolean } = {},
): string[] {
  const own = lessons.filter((l) => l.subjectId === subjectId)
  if (own.length === 0) return []

  const out: string[] = []
  const start = options.inclusive ? 0 : 1
  for (let i = start; i <= HORIZON_DAYS && out.length < count; i++) {
    const iso = addDays(fromISO, i)
    const wd = weekdayOf(iso)
    if (wd === 7) continue
    const p = parityOf(iso, anchorMonday)
    if (own.some((l) => matches(l, wd, p))) out.push(iso)
  }
  return out
}

export function nextLessonDate(
  subjectId: string,
  fromISO: string,
  lessons: Lesson[],
  anchorMonday: string,
  options: { inclusive?: boolean } = {},
): string | null {
  return nextLessonDates(subjectId, fromISO, lessons, anchorMonday, 1, options)[0] ?? null
}
