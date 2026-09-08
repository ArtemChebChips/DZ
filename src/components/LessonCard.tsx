import type { Lesson, Subject, Task } from '../types'
import { colorOf } from '../lib/palette'
import { minutesBetween } from '../lib/dates'
import { IconPlus } from './icons'
import { TaskPill } from './TaskPill'

/** «Купавцев А. В., Чуев А. С.» → «Купавцев»: в строку помещается только фамилия. */
function lastName(teacher?: string): string | undefined {
  if (!teacher) return undefined
  const first = teacher.split(',')[0].trim()
  return first.split(/\s+/)[0] || undefined
}

/**
 * Высота плашки пропорциональна длительности: семичасовой ВУЦ должен
 * выглядеть длиннее полуторачасового семинара. Нижняя граница держит
 * читаемость, верхняя не даёт одной паре занять весь экран.
 */
function heightFor(lesson: Lesson): number {
  const minutes = minutesBetween(lesson.start, lesson.end)
  return Math.min(240, Math.max(66, Math.round(minutes * 0.62)))
}

export function LessonCard({
  lesson,
  subject,
  tasks,
  onAdd,
  onOpenTask,
}: {
  lesson: Lesson
  subject?: Subject
  tasks: Task[]
  onAdd: () => void
  onOpenTask: (task: Task) => void
}) {
  const color = colorOf(subject?.color)
  const meta = [lesson.room, lastName(lesson.teacher)].filter(Boolean).join(' · ')

  return (
    <div className="card overflow-hidden">
      <div className="flex items-stretch" style={{ minHeight: heightFor(lesson) }}>
        <span className="w-1.5 shrink-0" style={{ background: color }} />

        <div className="shrink-0 py-2.5 pl-3 pr-1 w-14">
          <div className="text-[14px] font-semibold leading-none tabular-nums" style={{ color }}>
            {lesson.start}
          </div>
          <div className="text-[11px] text-muted mt-1 leading-none tabular-nums">{lesson.end}</div>
        </div>

        <div className="flex-1 min-w-0 py-2.5 px-1">
          {/* Короткое имя: полные названия занимают по две строки и распирают плашку. */}
          <p className="text-[15px] font-medium leading-snug truncate">
            {subject?.short || subject?.name || 'Неизвестный предмет'}
          </p>
          {meta ? <p className="text-[12px] text-muted mt-0.5 truncate">{meta}</p> : null}
        </div>

        <button
          type="button"
          onClick={onAdd}
          aria-label={`Добавить задание по предмету ${subject?.name ?? ''}`}
          className="shrink-0 self-start mt-2.5 mr-2.5 grid place-items-center w-9 h-9 rounded-full transition active:scale-95"
          style={{ background: color, color: 'var(--on-accent)' }}
        >
          <IconPlus size={18} />
        </button>
      </div>

      {tasks.length > 0 ? (
        <div className="px-2.5 pb-2.5 pl-4 flex flex-col gap-1.5">
          {tasks.map((task) => (
            <TaskPill
              key={task.id}
              task={task}
              subject={subject}
              onOpen={() => onOpenTask(task)}
              showSubject={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
