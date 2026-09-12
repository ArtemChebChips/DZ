import { useEffect, useMemo, useState } from 'react'
import type { Task } from '../types'
import { addTask, deleteTask, updateTask, useData } from '../store'
import { formatCompact, humanDue, todayISO } from '../lib/dates'
import { nextLessonDates } from '../lib/week'
import { subjectColor } from '../lib/palette'
import { Button, Field, Sheet, inputClass } from './ui'
import { IconTrash } from './icons'

type Preset = { date: string; label: string }

/**
 * Родитель монтирует редактор только когда он нужен, поэтому состояние
 * инициализируется свежим на каждое открытие и сбрасывать его вручную не надо.
 */
export function TaskEditor({
  onClose,
  lockedSubjectId,
  fromDate,
  task,
}: {
  onClose: () => void
  /** Открыт с плашки пары: предмет уже известен, выбирать его незачем. */
  lockedSubjectId?: string
  /** День, из которого открыли редактор. */
  fromDate?: string
  task?: Task
}) {
  const { subjects, lessons, settings } = useData()

  const [subjectId, setSubjectId] = useState(task?.subjectId ?? lockedSubjectId ?? subjects[0]?.id ?? '')
  const [title, setTitle] = useState(task?.title ?? '')
  const [note, setNote] = useState(task?.note ?? '')
  // Пока пользователь не трогал дату сам, она едет за выбранным предметом.
  const [dueTouched, setDueTouched] = useState(Boolean(task))
  const [due, setDue] = useState(task?.due ?? fromDate ?? '')

  const locked = Boolean(lockedSubjectId) && !task
  const subject = subjects.find((s) => s.id === subjectId)

  const presets: Preset[] = useMemo(() => {
    // Без предмета расписание подсказать нечего — остаётся только выбранный день.
    if (!subjectId) return fromDate ? [{ date: fromDate, label: 'В этот день' }] : []
    const base = fromDate ?? todayISO()
    const upcoming = nextLessonDates(subjectId, base, lessons, settings.anchorMonday, 2)

    // Открыли конкретный день — значит по умолчанию сдавать в него же.
    if (fromDate) {
      return [
        { date: fromDate, label: 'В этот день' },
        ...(upcoming[0] ? [{ date: upcoming[0], label: 'Следующая пара' }] : []),
      ]
    }
    return upcoming.map((date, i) => ({ date, label: i === 0 ? 'Следующая пара' : 'Через одну' }))
  }, [subjectId, fromDate, lessons, settings.anchorMonday])

  useEffect(() => {
    if (dueTouched) return
    setDue(presets[0]?.date ?? fromDate ?? todayISO())
  }, [presets, dueTouched, fromDate])

  const canSave = Boolean(title.trim() && due)

  function save() {
    if (!canSave) return
    if (task) {
      updateTask(task.id, {
        subjectId: subjectId || undefined,
        title: title.trim(),
        note: note.trim() || undefined,
        due,
      })
    } else {
      addTask({ subjectId: subjectId || undefined, title, note, due })
    }
    onClose()
  }

  function remove() {
    if (!task) return
    if (!confirm(`Удалить задание «${task.title}»?`)) return
    deleteTask(task.id)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        locked && subject ? (
          <span className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: subjectColor(subject.assessment) }}
            />
            <span className="truncate">{subject.short || subject.name}</span>
          </span>
        ) : task ? (
          'Задание'
        ) : (
          'Новое задание'
        )
      }
    >
      {locked ? null : (
        <Field label="Предмет">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSubjectId('')}
              className={`px-3 h-9 rounded-xl border text-[14px] transition ${
                subjectId === ''
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-line bg-surface-2 text-muted'
              }`}
            >
              Без предмета
            </button>
            {subjects.map((s) => {
              const active = s.id === subjectId
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSubjectId(s.id)}
                  className={`flex items-center gap-2 pl-2.5 pr-3 h-9 rounded-xl border text-[14px] transition ${
                    active ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-surface-2 text-muted'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: subjectColor(s.assessment) }}
                  />
                  {s.short || s.name}
                </button>
              )
            })}
          </div>
        </Field>
      )}

      <Field label="Что сделать">
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          rows={2}
          autoFocus={!task}
          placeholder="Например: №№ 12–18, конспект §4"
          className={`${inputClass} h-auto py-2.5 resize-none`}
        />
      </Field>

      <Field label="Заметка (не обязательно)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Ссылка, страница учебника, детали"
          className={`${inputClass} h-auto py-2.5 resize-none`}
        />
      </Field>

      <Field label="К какому дню">
        {presets.length > 0 ? (
          <div className="flex flex-col gap-2 mb-2">
            {presets.map((preset) => {
              const active = due === preset.date
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setDue(preset.date)
                    setDueTouched(true)
                  }}
                  className={`flex items-center justify-between px-3 h-12 rounded-xl border transition ${
                    active ? 'border-accent bg-accent/10' : 'border-line bg-surface-2'
                  }`}
                >
                  <span className="text-[14px]">
                    {preset.label}
                    <span className="text-muted"> · {formatCompact(preset.date)}</span>
                  </span>
                  <span className="text-[12px] text-muted">{humanDue(preset.date)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted mb-2">
            {subjectId
              ? 'У этого предмета нет пар в расписании — выбери дату вручную.'
              : 'Задание без предмета — выбери дату вручную.'}
          </p>
        )}
        <input
          type="date"
          value={due}
          onChange={(e) => {
            setDue(e.target.value)
            setDueTouched(true)
          }}
          className={inputClass}
        />
      </Field>

      <div className="flex gap-2 pt-2">
        {task ? (
          <button
            type="button"
            onClick={remove}
            aria-label="Удалить задание"
            className="shrink-0 grid place-items-center w-11 h-11 rounded-xl border border-danger/40 text-danger active:scale-95 transition"
          >
            <IconTrash size={20} />
          </button>
        ) : null}
        <Button onClick={save} disabled={!canSave} className="flex-1">
          {task ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </Sheet>
  )
}
