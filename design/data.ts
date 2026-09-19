import type { LessonKind } from '../src/types'
export { DEFAULT_LESSONS, DEFAULT_SUBJECTS, ANCHOR_MONDAY } from '../src/data/schedule'

// Фиксированная дата делает сравнение воспроизводимым. Только память вкладки.
export const TODAY = '2026-09-21'
export type DemoTask = {
  id: string
  subjectId: string
  title: string
  due: string
  done: boolean
  lessonId?: string
  kind?: LessonKind
}
export const INITIAL_TASKS: DemoTask[] = [
  { id: '1', subjectId: 'it', title: 'Доделать запросы к базе данных', due: '2026-09-18', done: false },
  { id: '2', subjectId: 'phys', title: 'Задачи 12–18: законы сохранения', due: TODAY, done: false, lessonId: 'pn-4', kind: 'seminar' },
  { id: '3', subjectId: 'matchem', title: 'Прочитать § 5, диаграммы состояния', due: TODAY, done: true },
  { id: '4', subjectId: 'innov', title: 'Подготовить тезисы к семинару', due: '2026-09-22', done: false, kind: 'seminar' },
  { id: '5', subjectId: 'eng', title: 'Unit 4: упражнения 5–9 и новые слова', due: '2026-09-22', done: false },
  { id: '6', subjectId: 'matchem', title: 'Разобрать диаграмму железо — углерод и подписать все фазовые переходы', due: '2026-09-23', done: false },
  { id: '7', subjectId: '', title: 'Отнести справку в деканат', due: '2026-09-24', done: false },
  { id: '8', subjectId: 'prob', title: 'Домашняя работа № 2, вариант 12', due: '2026-09-25', done: false },
  { id: '9', subjectId: 'it', title: 'Сдать вторую лабораторную', due: '2026-09-30', done: false, kind: 'lab' },
  { id: '10', subjectId: 'mech', title: 'Расчётно-графическая: первая часть', due: '2026-10-05', done: false },
]
export const CONCEPTS = [
  { id: 'a', name: 'Линия', subtitle: 'Чёткий список', description: 'Даты задают ритм. Задания собраны в компактные строки, а сроки всегда на виду.', detail: 'Для быстрого просмотра между парами.', number: '01', tags: ['Компактно', 'Ясная иерархия', 'Крупные даты'] },
  { id: 'b', name: 'Пауза', subtitle: 'Спокойный планер', description: 'Один день — один спокойный блок. Больше пространства для текста и меньше визуального шума.', detail: 'Чтобы разбирать задания без ощущения спешки.', number: '02', tags: ['Мягкие формы', 'Воздух', 'Крупный текст'] },
  { id: 'c', name: 'Сетка', subtitle: 'Графичный', description: 'Сильная типографика, чёткие контуры и цветные отметки. Учебный планер со своим характером.', detail: 'Для тех, кому хочется более выразительного интерфейса.', number: '03', tags: ['Контраст', 'Графика', 'Выразительность'] },
] as const
