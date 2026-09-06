import { useMemo, useState } from 'react'
import type { Task } from '../types'
import { useData } from '../store'
import { addDays, formatFull, todayISO } from '../lib/dates'
import { lessonsOn, parityLabel, parityOf } from '../lib/week'
import { navigate, routes } from '../lib/router'
import { Screen, EmptyState, IconButton } from '../components/ui'
import { IconChevronLeft, IconChevronRight, IconPlus } from '../components/icons'
import { LessonCard } from '../components/LessonCard'
import { TaskPill } from '../components/TaskPill'
import { TaskEditor } from '../components/TaskEditor'

type EditorState =
  | { mode: 'closed' }
  | { mode: 'new'; subjectId?: string }
  | { mode: 'edit'; task: Task }

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

  const tasksWithoutLesson = dayTasks.filter((t) => !firstSlotOfSubject.has(t.subjectId))

  const parity = parityOf(date, settings.anchorMonday)
  const isToday = date === todayISO()
  const isTomorrow = date === addDays(todayISO(), 1)
  const title = isToday ? 'Сегодня' : isTomorrow ? 'Завтра' : formatFull(date)
  const subtitle =
    isToday || isTomorrow ? `${formatFull(date)} · ${parityLabel(parity)}` : parityLabel(parity)

  return (
    <>
      <Screen
        title={title}
        subtitle={subtitle}
        left={
          <IconButton onClick={() => navigate(routes.day(addDays(date, -1)))} label="Предыдущий день">
            <IconChevronLeft />
          </IconButton>
        }
        right={
          <IconButton onClick={() => navigate(routes.day(addDays(date, 1)))} label="Следующий день">
            <IconChevronRight />
          </IconButton>
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
            <h2 className="display text-[14px] font-bold mb-2 px-0.5">Сдать в этот день</h2>
            <div className="flex flex-col gap-1.5">
              {tasksWithoutLesson.map((task) => (
                <TaskPill
                  key={task.id}
                  task={task}
                  subject={bySubject.get(task.subjectId)}
                  onOpen={() => setEditor({ mode: 'edit', task })}
                />
              ))}
            </div>
          </section>
        ) : null}
      </Screen>

      <button
        type="button"
        onClick={() => setEditor({ mode: 'new' })}
        aria-label="Добавить задание"
        className="fixed right-4 bottom-24 z-30 grid place-items-center w-14 h-14 rounded-2xl bg-accent shadow-lg shadow-black/20 active:scale-95 transition"
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
    </>
  )
}
