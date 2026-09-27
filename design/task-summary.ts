import type { DemoTask } from './data'
import { isDayNote } from './homework.ts'

function countLabel(count: number, forms: [string, string, string]) {
  const last = count % 10
  const index = count % 100 >= 11 && count % 100 <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2
  return `${count} ${forms[index]}`
}

export function taskSummary(tasks: DemoTask[]) {
  const active = tasks.filter(task => !task.done)
  const notes = active.filter(isDayNote).length
  const homework = active.length - notes
  return [
    homework ? countLabel(homework, ['задание', 'задания', 'заданий']) : '',
    notes ? countLabel(notes, ['заметка', 'заметки', 'заметок']) : '',
  ].filter(Boolean).join(', ') || 'Нет заданий'
}
