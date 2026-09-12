import { useRef, useState } from 'react'
import type { Subject, Task } from '../types'
import { deleteTask, toggleTask, updateTask } from '../store'
import { haptic } from '../lib/haptics'
import { IconCheck, IconTrash } from './icons'

/** Сдвиг, после которого жест считается свайпом, а не случайным касанием. */
const ACTION_AT = 72
/** Ширина кнопок, открывающихся из-под плашки. */
const ACTION_W = 116
/** Насколько нужно замереть пальцем, чтобы открылась быстрая правка. */
const HOLD_MS = 450

/**
 * Задача внутри блока дня.
 * Свайп влево открывает кнопку удаления, вправо отмечает выполненной,
 * долгое нажатие правит текст на месте, обычный тап — полный редактор.
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
  /*
   * Как только жест признан горизонтальным, ведём плашку до конца жеста.
   * Иначе при движении пальцем назад проверка направления срывалась и
   * плашка застывала на полпути.
   */
  const locked = useRef(false)

  const openedForDelete = dx <= -ACTION_W + 1 && !dragging

  const caption = [showSubject ? subject?.short || subject?.name : null, meta]
    .filter(Boolean)
    .join(' · ')

  function cancelHold() {
    if (hold.current) {
      clearTimeout(hold.current)
      hold.current = null
    }
  }

  function settle(value: number) {
    offset.current = value
    locked.current = false
    setDx(value)
  }

  function saveDraft() {
    const clean = draft.trim()
    if (clean && clean !== task.title) {
      haptic()
      updateTask(task.id, { title: clean })
    }
    setEditing(false)
  }

  function onTouchStart(e: React.TouchEvent) {
    if (editing) return
    const t = e.touches[0]
    from.current = { x: t.clientX - offset.current, y: t.clientY }
    locked.current = false
    if (openedForDelete) return
    hold.current = setTimeout(() => {
      haptic()
      setDraft(task.title)
      setEditing(true)
      settle(0)
    }, HOLD_MS)
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = from.current
    if (!start || editing) return
    const t = e.touches[0]
    const shiftX = t.clientX - start.x
    const shiftY = t.clientY - start.y

    if (Math.abs(shiftX - offset.current) + Math.abs(shiftY) > 8) cancelHold()

    if (!locked.current && Math.abs(shiftX) > Math.abs(shiftY) * 1.4 && Math.abs(shiftX) > 8) {
      locked.current = true
      setDragging(true)
    }
    if (locked.current) {
      e.stopPropagation()
      // Тянуть дальше кнопок незачем: жесты в обе стороны симметричны.
      const limited = Math.max(-ACTION_W, Math.min(ACTION_W, shiftX))
      offset.current = limited
      setDx(limited)
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
    if (locked.current) e.stopPropagation()

    if (shift > ACTION_AT) {
      settle(0)
      haptic(12)
      toggleTask(task.id)
      return
    }
    // Кнопка удаления остаётся открытой — закрыть можно тапом по плашке.
    settle(shift < -ACTION_W / 2 ? -ACTION_W : 0)
    if (shift < -ACTION_W / 2) haptic([8, 30, 8])
  }

  if (editing) {
    return (
      <div className="pill flex items-center gap-2 px-2.5 py-2.5">
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
          className="shrink-0 grid place-items-center w-7 h-7 rounded-full bg-accent"
          style={{ color: 'var(--on-accent)' }}
        >
          <IconCheck size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 'var(--radius-pill)' }}>
      {/* Отметка выполнения — зеркальная копия кнопки удаления. */}
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-center gap-1.5 bg-ok text-[14px] font-semibold pointer-events-none"
        style={{
          width: ACTION_W,
          color: 'var(--on-accent)',
          borderRadius: 'var(--radius-pill)',
          opacity: Math.min(1, Math.max(0, dx) / 24),
        }}
      >
        <IconCheck size={18} />
        {task.done ? 'Вернуть' : 'Готово'}
      </div>

      {/* Кнопка удаления лежит под плашкой и открывается вместе со свайпом. */}
      <button
        type="button"
        onClick={() => {
          haptic(20)
          deleteTask(task.id)
        }}
        tabIndex={openedForDelete ? 0 : -1}
        aria-hidden={!openedForDelete}
        className="absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 bg-danger text-[14px] font-semibold"
        style={{
          width: ACTION_W,
          color: 'var(--on-accent)',
          borderRadius: 'var(--radius-pill)',
          // В покое кнопка скрыта: иначе её край просвечивает красной каймой
          // по скруглённому углу плашки.
          opacity: Math.min(1, Math.max(0, -dx) / 24),
        }}
      >
        <IconTrash size={17} />
        Удалить
      </button>

      <div
        className="pill relative flex items-center gap-2.5 px-2.5 py-2.5"
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
          onClick={() => {
            if (openedForDelete) return settle(0)
            haptic()
            toggleTask(task.id)
          }}
          className={`shrink-0 grid place-items-center w-6 h-6 rounded-full border-2 transition active:scale-90 ${
            task.done ? 'bg-accent border-accent' : 'border-muted/60'
          }`}
          style={task.done ? { color: 'var(--on-accent)' } : undefined}
        >
          {task.done ? <IconCheck size={14} /> : null}
        </button>

        <button
          type="button"
          onClick={() => (openedForDelete ? settle(0) : onOpen())}
          className="flex-1 min-w-0 text-left"
        >
          <p className={`text-[14px] leading-snug ${task.done ? 'line-through text-muted' : ''}`}>
            {task.title}
          </p>
          {caption ? <p className="text-[11.5px] text-muted mt-0.5 truncate">{caption}</p> : null}
        </button>
      </div>
    </div>
  )
}
