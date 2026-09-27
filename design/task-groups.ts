import { addDays, mondayOf, weekdayOf } from '../src/lib/dates.ts'

/** С субботы планируем следующую учебную неделю; воскресные сроки не теряем. */
export function taskGroups<T extends { due: string }>(tasks: T[], today: string) {
  const tomorrow = addDays(today, 1)
  const start = addDays(mondayOf(today), weekdayOf(today) >= 6 ? 7 : 0)
  const end = addDays(start, 6)
  const groups = [
    { id: 'overdue', title: 'Просрочено', tasks: [] as T[] },
    { id: 'tomorrow', title: 'На завтра', tasks: [] as T[] },
    { id: 'current', title: 'Актуальная неделя', tasks: [] as T[] },
    { id: 'later', title: 'Позже', tasks: [] as T[] },
  ]
  for (const task of [...tasks].sort((a, b) => a.due.localeCompare(b.due))) {
    const index = task.due <= today ? 0 : task.due === tomorrow ? 1 : task.due >= start && task.due <= end ? 2 : 3
    groups[index].tasks.push(task)
  }
  return { start, end, groups: groups.filter(group => group.tasks.length) }
}
