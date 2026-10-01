import type { Lesson, Subject } from '../src/types'
import { addDays, toISO, weekdayOf } from '../src/lib/dates.ts'
import { lessonsOn } from '../src/lib/week.ts'
import { validDate } from './storage.ts'
import type { Draft } from './data'

export type Intent = { subjectId: string | null; title: string; deadlineText: string; deadline: { type: 'missing' | 'date' | 'days' | 'weekday' | 'nextLesson'; value: string; kind: string }; question: string }
export type Proposal = Draft & { selected: boolean; question: string; deadlineText: string }
export const aliases = { prob: ['теорвер', 'тервер'], vuc: ['вуц', 'военный учебный центр'], eng: ['английский', 'иняз'], pe: ['физра'] }

export function resolveProposal(intent: Intent, subjects: Subject[], lessons: Lesson[], anchor: string, now = new Date()): Proposal {
  const subjectId = subjects.some(s => s.id === intent.subjectId) ? intent.subjectId! : ''
  const today = toISO(now)
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  let due = '', question = intent.question || '', lesson: Lesson | undefined
  const deadline = intent.deadline
  if (deadline.type === 'date' && validDate(deadline.value)) due = deadline.value
  if (deadline.type === 'days' && /^\d{1,3}$/.test(deadline.value)) due = addDays(today, Number(deadline.value))
  if (deadline.type === 'weekday') question ||= 'Уточни дату: имеется в виду ближайший день или день следующей недели?'
  if (deadline.type === 'nextLesson' && subjectId) {
    const own = lessons.filter(l => l.subjectId === subjectId && (!deadline.kind || l.kind === deadline.kind))
    if (!deadline.kind && new Set(own.map(l => l.kind)).size > 1) question ||= 'Уточни вид занятия или выбери дату.'
    else for (let offset = 0; offset < 60; offset++) {
      const day = addDays(today, offset)
      const candidates = lessonsOn(day, own, anchor).filter(l => offset > 0 || l.start > time)
      const next = candidates[0]
      if (candidates.length > 1) question ||= 'В этот день несколько подходящих занятий. Проверь, к какому относится задание.'
      if (next) { due = day; lesson = candidates.length === 1 ? next : undefined; break }
    }
  }
  if (!subjectId) question ||= 'Выбери предмет.'
  if (!due) question ||= 'Выбери точную дату.'
  const kinds = lessons.filter(l => l.subjectId === subjectId).map(l => l.kind)
  const entryType = lesson ? (['seminar', 'lab'].includes(lesson.kind) ? 'homework' : 'note') : kinds.some(k => k === 'seminar' || k === 'lab') ? 'homework' : 'note'
  return { subjectId, title: intent.title, due, entryType, lessonId: lesson?.id, kind: lesson?.kind, question, deadlineText: intent.deadlineText, selected: true }
}

export function readIntents(value: unknown): Intent[] {
  const data = value as { tasks?: unknown[] }
  if (!data || !Array.isArray(data.tasks) || !data.tasks.length || data.tasks.length > 12) throw new Error('Не удалось получить задания. Попробуй уточнить текст.')
  return data.tasks.map(item => {
    const x = item as Intent
    if (!x || !(x.subjectId === null || typeof x.subjectId === 'string') || typeof x.title !== 'string' || !x.title.trim() || x.title.length > 4000 || typeof x.question !== 'string' || typeof x.deadlineText !== 'string' || !x.deadline || !['missing', 'date', 'days', 'weekday', 'nextLesson'].includes(x.deadline.type) || typeof x.deadline.value !== 'string' || !['', 'lecture', 'seminar', 'lab', 'other'].includes(x.deadline.kind)) throw new Error('Некорректный ответ. Попробуй ещё раз.')
    return x
  })
}

export function contextFor(subjects: Subject[], lessons: Lesson[], anchor: string, now: Date) {
  return { subjects, lessons, anchorMonday: anchor, aliases, localDate: toISO(now), localTime: now.toTimeString().slice(0, 5), weekday: weekdayOf(toISO(now)), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, exceptions: [], exceptionsKnown: false }
}
