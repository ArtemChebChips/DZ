import { useMemo, useState } from 'react'
import type { Task } from '../types'
import { useData } from '../store'
import { WEEKDAYS_FULL, addDays, diffDays, formatDayMonth, formatFull, todayISO, weekdayOf } from '../lib/dates'
import { lessonsOn, parityLabel, parityOf, parityShort } from '../lib/week'
import { navigate, routes } from '../lib/router'
import { useSwipe } from '../lib/swipe'
import { haptic } from '../lib/haptics'
import { Screen, EmptyState } from '../components/ui'
import { IconCalendar, IconPlus } from '../components/icons'
import { LessonCard } from '../components/LessonCard'
import { TaskPill } from '../components/TaskPill'
import { TaskEditor } from '../components/TaskEditor'

type EditorState =
  | { mode: 'closed' }
  | { mode: 'new'; subjectId?: string }
  | { mode: 'edit'; task: Task }

/** Квадрат шапки: бейдж слева и кнопка справа одного размера — шапка симметрична. */
const headSquare = 'grid place-items-center w-10 h-10 rounded-xl bg-surface-2'

export function DayScreen({ date }: { date: string }) {
  const { subjects, lessons, tasks, settings } = useData()
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })

  const bySubject = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const dayLessons = useMemo(
    () => lessonsOn(date, lessons, settings.anchorMonday),
    [date, lessons, settings.anchorMonday],
  )
  const dayTasks = useMemo(() => tasks.filter((t) => t.due === date), [tasks, date])

  /**
   * Если предмет стоит в дне дважды (лекция и семинар), задания показываем
   * только на первой паре — иначе они задвоятся.
   */
  const firstSlotOfSubject = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of dayLessons) if (!map.has(l.subjectId)) map.set(l.subjectId, l.id)
    return map
  }, [dayLessons])

  // Без предмета или предмет без пары в этот день — всё в отдельный блок.
  const tasksWithoutLesson = dayTasks.filter(
    (t) => !t.subjectId || !firstSlotOfSubject.has(t.subjectId),
  )

  const parity = parityOf(date, settings.anchorMonday)
  const isToday = date === todayISO()
  const isTomorrow = date === addDays(todayISO(), 1)
  /*
   * На ближайшие шесть дней вперёд главное — какой это день недели («Четверг»),
   * дальше и в прошлом — какое число. Окно именно шесть дней: седьмой день уже
   * совпал бы по дню недели с сегодняшним, и название стало бы двусмысленным.
   */
  const daysAhead = diffDays(todayISO(), date)
  const soon = daysAhead >= 2 && daysAhead <= 6
  const weekday = WEEKDAYS_FULL[weekdayOf(date) - 1]
  const weekdayTitle = weekday[0].toUpperCase() + weekday.slice(1)

  const title = isToday ? 'Сегодня' : isTomorrow ? 'Завтра' : soon ? weekdayTitle : formatDayMonth(date)
  const subtitle = isToday || isTomorrow ? formatFull(date) : soon ? formatDayMonth(date) : weekday

  const swipe = useSwipe(
    () => navigate(routes.day(addDays(date, 1))),
    () => navigate(routes.day(addDays(date, -1))),
  )

  return (
    <div {...swipe} className="flex-1 min-h-0 flex flex-col">
      <Screen
        title={title}
        subtitle={subtitle}
        left={
          <span
            className={`${headSquare} text-[15px] font-bold ${parity === 'num' ? 'text-accent' : 'text-warn'}`}
            title={parityLabel(parity)}
            aria-label={parityLabel(parity)}
          >
            {parityShort(parity)}
          </span>
        }
        right={
          <button
            type="button"
            onClick={() => {
              haptic()
              navigate(routes.calendar)
            }}
            aria-label="Открыть календарь"
            className={`${headSquare} text-ink active:scale-95 transition`}
          >
            <IconCalendar size={22} />
          </button>
        }
      >
        {dayLessons.length === 0 && dayTasks.length === 0 ? (
          <EmptyState title="В этот день пар нет" hint="Можно всё равно записать задание кнопкой ниже" />
        ) : null}

        <div className="flex flex-col gap-2.5">
          {dayLessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              subject={bySubject.get(lesson.subjectId)}
              tasks={
                firstSlotOfSubject.get(lesson.subjectId) === lesson.id
                  ? dayTasks.filter((t) => t.subjectId === lesson.subjectId)
                  : []
              }
              onAdd={() => setEditor({ mode: 'new', subjectId: lesson.subjectId })}
              onOpenTask={(task) => setEditor({ mode: 'edit', task })}
            />
          ))}
        </div>

        {tasksWithoutLesson.length > 0 ? (
          <section className="card px-3 pt-3 pb-3 mt-4">
            <h2 className="display text-[14px] font-bold mb-2 px-0.5 text-center">Сдать в этот день</h2>
            <div className="flex flex-col gap-1.5">
              {tasksWithoutLesson.map((task) => (
                <TaskPill
                  key={task.id}
                  task={task}
                  subject={task.subjectId ? bySubject.get(task.subjectId) : undefined}
                  onOpen={() => setEditor({ mode: 'edit', task })}
                />
              ))}
            </div>
          </section>
        ) : null}
      </Screen>

      <button
        type="button"
        onClick={() => {
          haptic()
          setEditor({ mode: 'new' })
        }}
        aria-label="Добавить задание"
        className="absolute right-4 bottom-28 z-40 grid place-items-center w-14 h-14 rounded-2xl bg-accent shadow-lg shadow-black/20 active:scale-95 transition"
        style={{ color: 'var(--on-accent)' }}
      >
        <IconPlus size={26} />
      </button>

      {editor.mode !== 'closed' ? (
        <TaskEditor
          onClose={() => setEditor({ mode: 'closed' })}
          fromDate={date}
          lockedSubjectId={editor.mode === 'new' ? editor.subjectId : undefined}
          task={editor.mode === 'edit' ? editor.task : undefined}
        />
      ) : null}
    </div>
  )
}
