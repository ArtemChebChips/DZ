import { useMemo, useState } from 'react'
import type { Subject, Task } from '../types'
import { useData } from '../store'
import { WEEKDAYS_SHORT, diffDays, formatDayMonth, formatFull, humanDue, parseISO, plural, todayISO, weekdayOf } from '../lib/dates'
import { parityLabel, parityOf } from '../lib/week'
import { buildBuckets, type Bucket } from '../lib/tasks'
import { navigate, routes } from '../lib/router'
import { Screen, Button } from '../components/ui'
import { IconPlus, IconCalendar, IconChevronRight, IconList, IconCheck } from '../components/icons'
import { TaskPill } from '../components/TaskPill'
import { TaskEditor } from '../components/TaskEditor'

function WeekBlock({ bucket, bySubject, onOpenTask, today }: { bucket: Bucket; bySubject: Map<string, Subject>; onOpenTask: (task: Task) => void; today: string }) {
  return (
    <section className={`week-block ${bucket.late ? 'is-late' : ''}`}>
      <header className="week-heading"><h2>{bucket.title}</h2><span className="week-count">{bucket.count}</span></header>
      {bucket.days.map(day => {
        const left = diffDays(today, day.date)
        const due = humanDue(day.date, today)
        return (
          <div className="day-group" key={day.date}>
            <div className={`date-rail ${left === 0 ? 'text-accent' : ''}`}>
              <span className="date-number">{parseISO(day.date).getDate()}</span>
              <span className="date-weekday">{WEEKDAYS_SHORT[weekdayOf(day.date) - 1]}</span>
            </div>
            <div className="min-w-0">
              <div className="day-deadline">
                <strong className={left < 0 ? 'text-danger' : left <= 1 ? 'text-accent' : ''}>{due[0].toUpperCase() + due.slice(1)}</strong>
                <time dateTime={day.date}>{formatDayMonth(day.date)}</time>
              </div>
              {day.tasks.map(task => <TaskPill key={task.id} task={task} subject={bySubject.get(task.subjectId)} onOpen={() => onOpenTask(task)} />)}
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
  const today = todayISO()
  const bySubject = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects])
  const open = tasks.filter(t => !t.done)
  const done = tasks.filter(t => t.done).sort((a, b) => b.due.localeCompare(a.due))
  const buckets = useMemo(() => buildBuckets(tasks, today), [tasks, today])
  return (
    <>
      <Screen title="Главное" subtitle={formatFull(today)} right={<span className="week-chip">{parityLabel(parityOf(today, settings.anchorMonday))}</span>}>
        <div className="tasks-toolbar">
          <span className="text-muted">{open.length ? `${open.length} ${plural(open.length, 'задание', 'задания', 'заданий')} в работе` : 'Все задания под контролем'}</span>
          <button className="text-link" onClick={() => navigate(routes.day(today))}><IconCalendar size={17} />Сегодня<IconChevronRight size={15} /></button>
        </div>
        {!open.length ? (
          <section className="empty-tasks">
            <div className="empty-tasks-icon">{done.length ? <IconCheck size={26} /> : <IconList size={26} />}</div>
            <h2>{done.length ? 'Всё сделано' : 'Пока без заданий'}</h2>
            <p>{done.length ? 'Можно выдохнуть. Новые задания появятся здесь по срокам сдачи.' : 'Запиши первое задание — ближайшая пара подскажет срок сдачи.'}</p>
            <Button onClick={() => setEditing('new')}><span className="flex items-center justify-center gap-2"><IconPlus size={19} />Добавить задание</span></Button>
            <div><button className="text-link mt-3" onClick={() => navigate(routes.calendar)}>Открыть календарь<IconChevronRight size={16} /></button></div>
          </section>
        ) : buckets.map(bucket => <WeekBlock key={bucket.key} bucket={bucket} bySubject={bySubject} onOpenTask={setEditing} today={today} />)}
        {done.length ? (
          <section className="mt-6">
            <button className="done-toggle" aria-expanded={showDone} onClick={() => setShowDone(v => !v)}><span>Выполненные · {done.length}</span><span>{showDone ? 'Скрыть' : 'Показать'}</span></button>
            {showDone ? done.map(task => <TaskPill key={task.id} task={task} subject={bySubject.get(task.subjectId)} onOpen={() => setEditing(task)} meta={formatDayMonth(task.due)} />) : null}
          </section>
        ) : null}
      </Screen>
      {open.length ? <button type="button" className="fab" onClick={() => setEditing('new')}><IconPlus size={21} />Задание</button> : null}
      {editing ? <TaskEditor onClose={() => setEditing(null)} task={editing === 'new' ? undefined : editing} /> : null}
    </>
  )
}
