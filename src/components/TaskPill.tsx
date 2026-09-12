import { useRef, useState } from 'react'
import type { Subject, Task } from '../types'
import { deleteTask, toggleTask, updateTask } from '../store'
import { IconCheck, IconTrash } from './icons'

/** Сдвиг, после которого жест считается свайпом, а не случайным касанием. */
const ACTION_AT = 72
/** Насколько нужно замереть пальцем, чтобы открылась быстрая правка. */
const HOLD_MS = 450

/**
 * Задача внутри блока дня.
 * Свайп вправо отмечает выполненной, влево — удаляет, долгое нажатие открывает
 * правку текста прямо в списке, обычный тап — полный редактор.
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
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)

  /*
   * Смещение держим и в состоянии (для отрисовки), и в ref: обработчик
   * отпускания видит состояние на момент рендера, а нам нужно актуальное.
   */
  const offset = useRef(0)
  const from = useRef<{ x: number; y: number } | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moved = useRef(false)

  const caption = [showSubject ? subject?.short || subject?.name : null, meta]
    .filter(Boolean)
    .join(' · ')

  function cancelHold() {
    if (hold.current) {
      clearTimeout(hold.current)
      hold.current = null
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (editing) return
    const t = e.touches[0]
    from.current = { x: t.clientX, y: t.clientY }
    moved.current = false
    hold.current = setTimeout(() => {
      setDraft(task.title)
      setEditing(true)
      offset.current = 0
      setDx(0)
    }, HOLD_MS)
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = from.current
    if (!start || editing) return
    const t = e.touches[0]
    const shiftX = t.clientX - start.x
    const shiftY = t.clientY - start.y

    if (!moved.current && Math.abs(shiftX) + Math.abs(shiftY) > 8) {
      moved.current = true
      cancelHold()
    }
    // Вертикальный жест оставляем списку, горизонтальный забираем себе.
    if (Math.abs(shiftX) > Math.abs(shiftY) * 1.4) {
      e.stopPropagation()
      setDragging(true)
      offset.current = shiftX
      setDx(shiftX)
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    cancelHold()
    from.current = null
    setDragging(false)

    const shift = offset.current
    /*
     * Экран дня листает дни по своему свайпу и слушает отпускание выше нас.
     * Если жест забрали себе, гасим всплытие, иначе день перелистнётся.
     */
    if (Math.abs(shift) > 4) e.stopPropagation()
    offset.current = 0
    setDx(0)

    if (shift > ACTION_AT) toggleTask(task.id)
    else if (shift < -ACTION_AT) {
      if (confirm(`Удалить задание «${task.title}»?`)) deleteTask(task.id)
    }
  }

  function saveDraft() {
    const clean = draft.trim()
    if (clean && clean !== task.title) updateTask(task.id, { title: clean })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="pill flex items-center gap-2 px-2.5 py-2">
        <input
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveDraft()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px]"
        />
        <button
          type="button"
          onClick={saveDraft}
          aria-label="Сохранить"
          className="shrink-0 grid place-items-center w-8 h-8 rounded-full bg-accent"
          style={{ color: 'var(--on-accent)' }}
        >
          <IconCheck size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 'var(--radius-pill)' }}>
      {/* Подсказки о том, что произойдёт, проявляются по мере сдвига. */}
      <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
        <span className="text-ok" style={{ opacity: Math.min(1, Math.max(0, dx) / ACTION_AT) }}>
          <IconCheck size={20} />
        </span>
        <span className="text-danger" style={{ opacity: Math.min(1, Math.max(0, -dx) / ACTION_AT) }}>
          <IconTrash size={20} />
        </span>
      </div>

      <div
        className="pill flex items-center gap-2.5 px-2.5 py-2.5"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform 180ms ease-out',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
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
    </div>
  )
}
