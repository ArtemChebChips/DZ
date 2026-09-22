import type { LessonKind } from '../src/types'
import { DEFAULT_SUBJECTS } from '../src/data/schedule'
export { DEFAULT_LESSONS, DEFAULT_SUBJECTS, ANCHOR_MONDAY } from '../src/data/schedule'

// Фиксированная дата делает сравнение воспроизводимым. Только память вкладки.
export const IS_DEMO = new URLSearchParams(location.search).get('demo') === '1'
const now = new Date()
export const TODAY = IS_DEMO ? '2026-09-21' : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
export type DemoTask = {
  id: string
  subjectId: string
  title: string
  due: string
  done: boolean
  entryType?: 'homework' | 'note'
  testBatchId?: string
  lessonId?: string
  kind?: LessonKind
}
export type Draft = Omit<DemoTask, 'id' | 'done'> & { id?: string; locked?: boolean }
export const INITIAL_TASKS: DemoTask[] = [
  { id: '1', subjectId: 'phys', title: 'Решить задачи 3–7', due: TODAY, done: false, lessonId: 'pn-4', kind: 'seminar' },
  { id: '2', subjectId: 'mech', title: 'Подготовиться к семинару', due: TODAY, done: false },
  { id: '3', subjectId: 'it', title: 'Закончить отчёт по лабораторной', due: TODAY, done: false },
  { id: '4', subjectId: 'eng', title: 'Выучить слова', due: '2026-09-22', done: false },
  { id: '5', subjectId: '', title: 'Распечатать конспект', due: '2026-09-24', done: false },
]
export const EXTRA_TASKS: DemoTask[] = [
  { id: 'late', subjectId: 'it', title: 'Доделать запросы к базе данных', due: '2026-09-18', done: false },
  { id: 'long', subjectId: 'innov', title: 'Подготовить подробный разбор инновационного проекта: описать ограничения, привести расчёты и оформить список источников', due: '2026-09-23', done: false },
  { id: 'done', subjectId: 'matchem', title: 'Прочитать § 5, диаграммы состояния', due: TODAY, done: true },
  { id: 'next', subjectId: 'it', title: 'Сдать вторую лабораторную', due: '2026-09-30', done: false, kind: 'lab' },
  { id: 'later', subjectId: 'mech', title: 'Расчётно-графическая: первая часть', due: '2026-10-05', done: false },
]

const subjectNames: Record<string, string> = {
  phys: 'Физика', matchem: 'Материаловедение', mech: 'Механика',
  prob: 'Тервер', eng: 'Английский', pe: 'Физра', metro: 'Метрология',
}
export const subjectName = (id: string) => subjectNames[id] || DEFAULT_SUBJECTS.find(s => s.id === id)?.short || 'Личное'
export const kindName = { lecture: 'Лекция', seminar: 'Семинар', lab: 'Лабораторная', other: 'Занятие' }
