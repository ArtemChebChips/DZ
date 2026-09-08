import type { Subject, Task } from '../types'
import { toggleTask } from '../store'
import { colorOf } from '../lib/palette'
import { IconCheck } from './icons'

export function TaskPill({ task, subject, onOpen, meta, showSubject = true }: {
  task: Task; subject?: Subject; onOpen: () => void; meta?: string; showSubject?: boolean
}) {
  const color = colorOf(subject?.color)
  return (
    <div className="task-row">
      <button type="button" className="task-check" aria-label={`${task.done ? 'Вернуть в работу' : 'Выполнить'}: ${task.title}`}
        aria-pressed={task.done} onClick={() => toggleTask(task.id)}>
        <span className="task-check-circle" style={task.done ? { background: color, borderColor: color, color: 'var(--c-surface)' } : undefined}>
          {task.done ? <IconCheck size={15} /> : null}
        </span>
      </button>
      <button type="button" onClick={onOpen} className="task-content">
        <p className={`task-title ${task.done ? 'line-through text-muted' : ''}`}>{task.title}</p>
        {(showSubject || meta || task.note) ? (
          <div className="task-caption">
            {showSubject ? <span className="subject-caption" style={{ color }}>{subject?.short || subject?.name || 'Без предмета'}</span> : null}
            {meta ? <span>{meta}</span> : null}
            {task.note ? <span>Есть заметка</span> : null}
          </div>
        ) : null}
      </button>
    </div>
  )
}
