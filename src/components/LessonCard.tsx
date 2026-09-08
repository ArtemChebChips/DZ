import type { Lesson, Subject, Task } from '../types'
import { colorOf } from '../lib/palette'
import { IconPlus } from './icons'
import { TaskPill } from './TaskPill'

const KIND_LABEL: Record<Lesson['kind'], string> = {
  lecture: 'лекция',
  seminar: 'семинар',
  lab: 'лаб. работа',
  other: '',
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
  const place = [lesson.room, lesson.building].filter(Boolean).join(' · ')
  const meta = [KIND_LABEL[lesson.kind], place].filter(Boolean).join(' · ')

  return (
    <div className="card lesson-card overflow-hidden">
      <div className="flex items-stretch">
        <span className="w-1 shrink-0" style={{ background: color }} />

        <div className="shrink-0 py-5 pl-3 pr-2 w-[66px]">
          <div className="text-[16px] font-semibold leading-none tabular-nums">
            {lesson.start}
          </div>
          <div className="text-[12px] text-muted mt-2 leading-none tabular-nums">{lesson.end}</div>
        </div>

        <div className="flex-1 min-w-0 py-4 px-1">
          <p className="text-[16px] font-semibold leading-snug">{subject?.name ?? 'Неизвестный предмет'}</p>
          {meta ? <p className="text-[13px] text-muted mt-2">{meta}</p> : null}
          {lesson.teacher ? (
            <p className="text-[12px] text-muted/80 mt-0.5">{lesson.teacher}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onAdd}
          aria-label={`Добавить задание по предмету ${subject?.name ?? ''}`}
          className="shrink-0 self-center grid place-items-center w-11 h-11 mr-2 rounded-xl bg-surface-2 transition active:scale-95"
          style={{ color }}
        >
          <IconPlus size={20} />
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
