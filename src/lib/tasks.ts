import type { Task } from '../types'
import { addDays, mondayOf, weekdayOf } from './dates'

export type Bucket = { key: string; title: string; late: boolean; days: { date: string; tasks: Task[] }[]; count: number }

export function buildBuckets(tasks: Task[], today: string): Bucket[] {
  const start = weekdayOf(today) === 7 ? addDays(today, 1) : today
  const end = addDays(mondayOf(start), 6)
  const nextEnd = addDays(end, 7)
  const groups: Task[][] = [[], [], [], []]
  for (const task of [...tasks].filter(t => !t.done).sort((a, b) => a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt))) {
    groups[task.due < today ? 0 : task.due <= end ? 1 : task.due <= nextEnd ? 2 : 3].push(task)
  }
  return groups.map((items, i) => {
    const days = new Map<string, Task[]>()
    for (const task of items) days.set(task.due, [...(days.get(task.due) ?? []), task])
    return { key: ['overdue', 'this', 'next', 'later'][i], title: ['Просрочено', 'Эта неделя', 'Следующая неделя', 'Больше недели'][i], late: i === 0,
      count: items.length, days: [...days].map(([date, tasks]) => ({ date, tasks })) }
  }).filter(bucket => bucket.count > 0)
}
