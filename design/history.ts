import type { DemoTask } from './data'

// Сортируем по сроку, а не по неизвестной дате выполнения старых записей.
export function completedTasks(tasks: DemoTask[]) {
  return tasks.filter(task => task.done).sort((a, b) => b.due.localeCompare(a.due) || a.id.localeCompare(b.id))
}
