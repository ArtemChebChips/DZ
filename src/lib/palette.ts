import type { Assessment, LessonKind } from '../types'

/**
 * Цвет несёт смысл: он говорит, чем предмет заканчивается. Лабораторные
 * выделены отдельно — по ним чаще всего и висят долги.
 */
export const ASSESSMENTS: { value: Assessment; label: string; short: string }[] = [
  { value: 'exam', label: 'Экзамен', short: 'экз' },
  { value: 'dist', label: 'Распределённый экзамен', short: 'р. экз' },
  { value: 'credit', label: 'Зачёт', short: 'зач' },
  { value: 'other', label: 'Без аттестации', short: '—' },
]

export function assessmentLabel(value: Assessment): string {
  return ASSESSMENTS.find((a) => a.value === value)?.label ?? 'Зачёт'
}

/** Цвет предмета — по виду аттестации. */
export function subjectColor(assessment?: Assessment): string {
  return `var(--a-${assessment ?? 'credit'})`
}

/** Цвет конкретной пары: у лабораторных он свой, независимо от аттестации. */
export function lessonColor(assessment?: Assessment, kind?: LessonKind): string {
  return kind === 'lab' ? 'var(--a-lab)' : subjectColor(assessment)
}
