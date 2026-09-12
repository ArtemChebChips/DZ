import { useMemo, useState } from 'react'
import type { Subject, Task } from '../types'
import { seedDemoTasks, useData } from '../store'
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
import { useCollapsed } from '../lib/collapsed'
import { Screen, EmptyState, Button } from '../components/ui'
import { IconChevronDown, IconPlus } from '../components/icons'
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
/** В счётчике блока показываем только то, что ещё предстоит сделать. */
function undone(tasks: Task[]): number {
  return tasks.filter((t) => !t.done).length
}

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
    { key: 'overdue', title: 'Просрочено', late: true, days: byDays(overdue), count: undone(overdue) },
    { key: 'this', title: 'Эта неделя', days: byDays(thisWeek), count: undone(thisWeek) },
    { key: 'next', title: 'Следующая неделя', days: byDays(nextWeek), count: undone(nextWeek) },
    { key: 'later', title: 'Больше недели', days: byDays(later), count: undone(later) },
  ].filter((bucket) => bucket.days.length > 0)
}

function WeekBlock({
  bucket,
  bySubject,
  onOpenTask,
  collapsed,
  onToggle,
}: {
  bucket: Bucket
  bySubject: Map<string, Subject>
  onOpenTask: (task: Task) => void
  collapsed: boolean
  onToggle: () => void
}) {
  const today = todayISO()

  return (
    <section className={`card px-3 pt-3 ${collapsed ? 'pb-3' : 'pb-1'} ${bucket.late ? 'card-late' : ''}`}>
      {/* Шапка целиком служит кнопкой: промахнуться мимо мелкой стрелки легко. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2 px-0.5 text-left"
      >
        <h2 className={`display flex-1 text-[14px] font-bold ${bucket.late ? 'text-danger' : ''}`}>
          {bucket.title}
        </h2>
        <span className="text-[12px] text-muted tabular-nums">{bucket.count}</span>
        <IconChevronDown
          size={18}
          className={`text-muted transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>

      {collapsed
        ? null
        : bucket.days.map((day, index) => {
        const left = diffDays(today, day.date)
        const overdue = left < 0
        return (
          <div key={day.date}>
            <p className={`text-[13px] font-semibold text-ink/75 pb-1.5 px-0.5 ${index > 0 ? 'pt-3.5' : 'pt-1'}`}>
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
  const { isCollapsed, toggle } = useCollapsed()

  const bySubject = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt)),
    [tasks],
  )
  const open = useMemo(() => sorted.filter((t) => !t.done), [sorted])
  // Выполненное либо остаётся зачёркнутым на своём месте, либо прячется вниз.
  const visible = settings.keepDoneVisible ? sorted : open
  const done = useMemo(
    () => tasks.filter((t) => t.done).sort((a, b) => b.due.localeCompare(a.due)),
    [tasks],
  )
  const buckets = useMemo(() => buildBuckets(visible), [visible])

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
            hint="Добавь своё кнопкой ниже или открой нужный день во вкладке «День»"
            action={
              <Button variant="ghost" onClick={seedDemoTasks}>
                Накидать примеры
              </Button>
            }
          />
        ) : null}

        <div className="flex flex-col gap-3">
          {buckets.map((bucket) => (
            <WeekBlock
              key={bucket.key}
              bucket={bucket}
              bySubject={bySubject}
              onOpenTask={setEditing}
              collapsed={isCollapsed(bucket.key)}
              onToggle={() => toggle(bucket.key)}
            />
          ))}
        </div>

        {!settings.keepDoneVisible && done.length > 0 ? (
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
        className="absolute right-4 bottom-28 z-40 grid place-items-center w-14 h-14 rounded-2xl bg-accent shadow-lg shadow-black/20 active:scale-95 transition"
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
