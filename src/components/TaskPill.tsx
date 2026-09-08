import type { Subject, Task } from '../types'
import { toggleTask } from '../store'
import { IconCheck } from './icons'

/**
 * Задача внутри блока дня. Чекбокс одного цвета для всех предметов —
 * пестрота из разноцветных кружков только мешала читать список.
 */
export function TaskPill({
  task,
  subject,
  onOpen,
  meta,
  showSubject = true,
}: {
  task: Task
  subject?: Subject
  onOpen: () => void
  /** Дополнительная подпись справа от предмета: срок, просрочка. */
  meta?: string
  showSubject?: boolean
}) {
  const caption = [showSubject ? subject?.short || subject?.name : null, meta]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="pill flex items-center gap-2.5 px-2.5 py-2.5">
      <button
        type="button"
        aria-label={task.done ? 'Вернуть в работу' : 'Отметить выполненным'}
        onClick={() => toggleTask(task.id)}
        className={`shrink-0 grid place-items-center w-6 h-6 rounded-full border-2 transition active:scale-90 ${
          task.done ? 'bg-accent border-accent' : 'border-muted/60'
        }`}
        style={task.done ? { color: 'var(--on-accent)' } : undefined}
      >
        {task.done ? <IconCheck size={14} /> : null}
      </button>

      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className={`text-[14px] leading-snug ${task.done ? 'line-through text-muted' : ''}`}>
          {task.title}
        </p>
        {caption ? <p className="text-[11.5px] text-muted mt-0.5 truncate">{caption}</p> : null}
      </button>
    </div>
  )
}
