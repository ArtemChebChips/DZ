import type { Lesson, LessonKind } from '../src/types'

export const isHomeworkKind = (kind?: LessonKind): kind is 'seminar' | 'lab' => kind === 'seminar' || kind === 'lab'

export function homeworkLessons(subjectId: string, lessons: Lesson[], kind?: LessonKind) {
  return lessons.filter(lesson => lesson.subjectId === subjectId && isHomeworkKind(lesson.kind) && (!kind || lesson.kind === kind))
}

export const isDayNote = (task: { subjectId: string; entryType?: 'homework' | 'note' }) => task.entryType === 'note' || (!task.entryType && !task.subjectId)

// Явная связь не заменяется первой похожей парой после изменения расписания.
export function taskLesson(task: { subjectId: string; lessonId?: string; kind?: LessonKind; entryType?: 'homework' | 'note' }, lessons: Lesson[]) {
  if (isDayNote(task)) return undefined
  if (task.lessonId) return lessons.find(lesson => lesson.id === task.lessonId && lesson.subjectId === task.subjectId && (!task.kind || lesson.kind === task.kind))
  const candidates = homeworkLessons(task.subjectId, lessons, task.kind)
  return candidates.length === 1 ? candidates[0] : undefined
}
