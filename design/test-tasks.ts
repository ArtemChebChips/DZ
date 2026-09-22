import type { DemoTask } from './data'
import type { Lesson } from '../src/types'
import { isHomeworkKind } from './homework.ts'

export const isTestTask = (task: DemoTask) => Boolean(task.testBatchId)
export const withoutTestTasks = (tasks: DemoTask[]) => tasks.filter(task => !isTestTask(task))

// Получаем готовые дни из настоящего расписания: никаких отдельных правил чередования.
export function generateTestTasks(days: { date: string; lessons: Lesson[] }[], batchId: string, random = Math.random): DemoTask[] {
  const result: DemoTask[] = []
  const texts = ['Решить задачи 3–7', 'Повторить конспект', 'Подготовить подробный отчёт: записать результаты измерений, построить графики, сравнить погрешности и сформулировать выводы', 'Закончить расчёты', 'Разобрать примеры из тетради']
  for (let week = 0; week < 3; week++) {
    const weekDays = days.slice(week * 7, week * 7 + 7)
    const choices = weekDays.flatMap(day => day.lessons.filter(lesson => isHomeworkKind(lesson.kind)).map(lesson => ({ due: day.date, lesson })))
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[choices[i], choices[j]] = [choices[j], choices[i]]
    }
    for (const { due, lesson } of choices.slice(0, 7)) {
      result.push({ id: `${batchId}-${result.length}`, testBatchId: batchId, entryType: 'homework', subjectId: lesson.subjectId, lessonId: lesson.id, kind: lesson.kind, due, title: texts[Math.floor(random() * texts.length)], done: result.length % 5 === 0 })
    }
    const day = weekDays[weekDays.length - 1]
    if (day) result.push({ id: `${batchId}-${result.length}`, testBatchId: batchId, entryType: 'note', subjectId: '', due: day.date, title: ['Распечатать материалы на неделю', 'Забрать тетрадь у друга', 'Проверить, всё ли готово к следующей неделе'][week], done: false })
  }
  return result
}
