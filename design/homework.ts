import type { Lesson, LessonKind } from '../src/types'

export const isHomeworkKind = (kind?: LessonKind): kind is 'seminar' | 'lab' => kind === 'seminar' || kind === 'lab'

export function homeworkLessons(subjectId: string, lessons: Lesson[], kind?: LessonKind) {
  return lessons.filter(lesson => lesson.subjectId === subjectId && isHomeworkKind(lesson.kind) && (!kind || lesson.kind === kind))
}

// Явная связь не заменяется первой похожей парой после изменения расписания.
export function taskLesson(task: { subjectId: string; lessonId?: string; kind?: LessonKind }, lessons: Lesson[]) {
  if (task.lessonId) return lessons.find(lesson => lesson.id === task.lessonId && lesson.subjectId === task.subjectId && (!task.kind || lesson.kind === task.kind))
  const candidates = homeworkLessons(task.subjectId, lessons, task.kind)
  return candidates.length === 1 ? candidates[0] : undefined
}
