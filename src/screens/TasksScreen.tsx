import { useMemo, useState } from 'react'
import type { Subject, Task } from '../types'
import { useData } from '../store'
import {
  MONTHS_GEN,
  WEEKDAYS_FULL,
  addDays,
  diffDays,
  formatDayMonth,
  mondayOf,
  parseISO,
  plural,
  todayISO,
  weekdayOf,
} from '../lib/dates'
import { parityLabel, parityOf } from '../lib/week'
import { Screen, EmptyState } from '../components/ui'
import { IconPlus } from '../components/icons'
import { TaskPill } from '../components/TaskPill'
import { TaskEditor } from '../components/TaskEditor'

type DayGroup = { date: string; tasks: Task[] }
type Bucket = { key: string; title: string; late?: boolean; days: DayGroup[]; count: number }

/** «Понедельник, 7 сентября» */
function dayLabel(iso: string): string {
  const d = parseISO(iso)
  const weekday = WEEKDAYS_FULL[weekdayOf(iso) - 1]
  return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

function byDays(tasks: Task[]): DayGroup[] {
  const map = new Map<string, Task[]>()
  for (const task of tasks) {
    const list = map.get(task.due) ?? []
    list.push(task)
    map.set(task.due, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({ date, tasks: list }))
}

/**
 * Раскладывает задания по неделям. В воскресенье учебная неделя уже кончилась,
 * поэтому «этой» считаем ту, что начинается завтра — иначе блок вечно пустой.
 */
function buildBuckets(tasks: Task[]): Bucket[] {
  const today = todayISO()
  const thisWeekStart = weekdayOf(today) === 7 ? addDays(today, 1) : today
  const thisWeekEnd = addDays(mondayOf(thisWeekStart), 6)
  const nextWeekEnd = addDays(thisWeekEnd, 7)

  const overdue: Task[] = []
  const thisWeek: Task[] = []
  const nextWeek: Task[] = []
  const later: Task[] = []

  for (const task of tasks) {
    if (diffDays(today, task.due) < 0) overdue.push(task)
    else if (task.due <= thisWeekEnd) thisWeek.push(task)
    else if (task.due <= nextWeekEnd) nextWeek.push(task)
    else later.push(task)
  }

  return [
    { key: 'overdue', title: 'Просрочено', late: true, days: byDays(overdue), count: overdue.length },
    { key: 'this', title: 'Эта неделя', days: byDays(thisWeek), count: thisWeek.length },
    { key: 'next', title: 'Следующая неделя', days: byDays(nextWeek), count: nextWeek.length },
    { key: 'later', title: 'Больше недели', days: byDays(later), count: later.length },
  ].filter((bucket) => bucket.count > 0)
}

function WeekBlock({
  bucket,
  bySubject,
  onOpenTask,
}: {
  bucket: Bucket
  bySubject: Map<string, Subject>
  onOpenTask: (task: Task) => void
}) {
  const today = todayISO()

  return (
    <section className={`card px-3 pt-3 pb-1 ${bucket.late ? 'card-late' : ''}`}>
      <header className="flex items-baseline justify-between mb-2 px-0.5">
        <h2 className={`display text-[14px] font-bold ${bucket.late ? 'text-danger' : ''}`}>
          {bucket.title}
        </h2>
        <span className="text-[12px] text-muted tabular-nums">{bucket.count}</span>
      </header>

      {bucket.days.map((day, index) => {
        const left = diffDays(today, day.date)
        const overdue = left < 0
        return (
          <div key={day.date}>
            <p
              className={`text-[11.5px] font-semibold text-muted pb-1.5 pt-2 px-0.5 ${
                index > 0 ? 'border-t border-line mt-1' : ''
              }`}
            >
              {dayLabel(day.date)}
              {left === 0 ? ' · сегодня' : left === 1 ? ' · завтра' : ''}
            </p>
            <div className="flex flex-col gap-1.5 pb-1.5">
              {day.tasks.map((task) => (
                <TaskPill
                  key={task.id}
                  task={task}
                  subject={bySubject.get(task.subjectId)}
                  onOpen={() => onOpenTask(task)}
                  meta={
                    overdue
                      ? `${-left} ${plural(-left, 'день', 'дня', 'дней')} назад`
                      : bucket.key === 'later'
                        ? `через ${left} ${plural(left, 'день', 'дня', 'дней')}`
                        : undefined
                  }
                />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

export function TasksScreen() {
  const { subjects, tasks, settings } = useData()
  const [showDone, setShowDone] = useState(false)
  const [editing, setEditing] = useState<Task | 'new' | null>(null)

  const bySubject = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  const open = useMemo(
    () =>
      tasks
        .filter((t) => !t.done)
        .sort((a, b) => a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt)),
    [tasks],
  )
  const done = useMemo(
    () => tasks.filter((t) => t.done).sort((a, b) => b.due.localeCompare(a.due)),
    [tasks],
  )
  const buckets = useMemo(() => buildBuckets(open), [open])

  const parity = parityLabel(parityOf(todayISO(), settings.anchorMonday))
  const subtitle =
    open.length > 0
      ? `${parity} · ${open.length} ${plural(open.length, 'задание', 'задания', 'заданий')}`
      : `${parity} · всё сделано`

  return (
    <>
      <Screen title="Задачи" subtitle={subtitle}>
        {open.length === 0 ? (
          <EmptyState
            title="Заданий нет"
            hint="Добавь первое кнопкой ниже или открой нужный день в календаре"
          />
        ) : null}

        <div className="flex flex-col gap-3">
          {buckets.map((bucket) => (
            <WeekBlock
              key={bucket.key}
              bucket={bucket}
              bySubject={bySubject}
              onOpenTask={setEditing}
            />
          ))}
        </div>

        {done.length > 0 ? (
          <section className="mt-4">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="text-[13px] text-muted px-1 py-2"
            >
              {showDone ? 'Скрыть выполненные' : `Выполненные (${done.length})`}
            </button>
            {showDone ? (
              <div className="card px-3 py-3 flex flex-col gap-1.5">
                {done.map((task) => (
                  <TaskPill
                    key={task.id}
                    task={task}
                    subject={bySubject.get(task.subjectId)}
                    onOpen={() => setEditing(task)}
                    meta={formatDayMonth(task.due)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </Screen>

      <button
        type="button"
        onClick={() => setEditing('new')}
        aria-label="Добавить задание"
        className="absolute right-4 bottom-20 z-30 grid place-items-center w-14 h-14 rounded-2xl bg-accent shadow-lg shadow-black/20 active:scale-95 transition"
        style={{ color: 'var(--on-accent)' }}
      >
        <IconPlus size={26} />
      </button>

      {editing ? (
        <TaskEditor
          onClose={() => setEditing(null)}
          task={editing === 'new' ? undefined : editing}
        />
      ) : null}
    </>
  )
}
