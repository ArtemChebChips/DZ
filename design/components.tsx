import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addDays, diffDays, formatDayMonth, mondayOf, parseISO, toISO, WEEKDAYS_SHORT, MONTHS_NOM } from '../src/lib/dates'
import { lessonsOn, nextLessonDates } from '../src/lib/week'
import { IconCheck, IconX, IconChevronLeft, IconChevronRight, IconTrash } from '../src/components/icons'
import { homeworkLessons, isHomeworkKind, taskLesson, isDayNote } from './homework'
import type { LessonKind } from '../src/types'
import { ANCHOR_MONDAY, DEFAULT_LESSONS, DEFAULT_SUBJECTS, subjectName, kindName, type Draft } from './data'

export function Modal({ title, onClose, children, variant }: { variant?: 'calendar'; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const viewport = window.visualViewport
    // Клавиатура iPhone уменьшает видимую область, не обязательно высоту страницы.
    const fit = () => {
      const height = `${viewport?.height ?? window.innerHeight}px`
      const resized = dialog.style.getPropertyValue('--sheet-height') !== height
      dialog.style.setProperty('--sheet-height', height)
      dialog.style.setProperty('--sheet-top', `${viewport?.offsetTop ?? 0}px`)
      const field = document.activeElement
      if (resized && dialog.open && field instanceof HTMLElement && dialog.contains(field) && field.matches('input, textarea, select')) {
        const bounds = field.getBoundingClientRect()
        const top = dialog.querySelector('header')!.getBoundingClientRect().bottom + 12
        const bottom = (dialog.querySelector('footer')?.getBoundingClientRect().top ?? dialog.getBoundingClientRect().bottom) - 12
        if (bounds.bottom > bottom) dialog.scrollTop += bounds.bottom - bottom
        else if (bounds.top < top) dialog.scrollTop -= top - bounds.top
      }
    }
    fit()
    dialog.showModal()
    viewport?.addEventListener('resize', fit)
    viewport?.addEventListener('scroll', fit)
    window.addEventListener('resize', fit)
    return () => {
      viewport?.removeEventListener('resize', fit)
      viewport?.removeEventListener('scroll', fit)
      window.removeEventListener('resize', fit)
      dialog.close()
    }
  }, [])
  return <dialog ref={ref} className={`sheet ${variant === 'calendar' ? 'calendar-sheet' : ''}`} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }} aria-label={title}>
    <div className="sheet-inner"><header><h2>{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}><IconX /></button></header>{children}</div>
  </dialog>
}

export function Calendar({ value, today, onChange, kinds }: { value: string; today: string; onChange: (date: string) => void; kinds?: (date: string) => LessonKind[] }) {
  const [month, setMonth] = useState(value)
  useEffect(() => { setMonth(value) }, [value])
  const d = parseISO(month)
  const first = toISO(new Date(d.getFullYear(), d.getMonth(), 1))
  const last = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  const start = mondayOf(first)
  const count = Math.ceil((diffDays(start, last) + 1) / 7) * 7
  const shift = (n: number) => setMonth(toISO(new Date(d.getFullYear(), d.getMonth() + n, 1)))
  return <div className="month-calendar">
    <div className="month-title"><strong>{MONTHS_NOM[d.getMonth()]} {d.getFullYear()}</strong><button type="button" className="icon-button" onClick={() => shift(-1)} aria-label="Предыдущий месяц"><IconChevronLeft size={18} /></button><button type="button" className="icon-button" onClick={() => shift(1)} aria-label="Следующий месяц"><IconChevronRight size={18} /></button></div>
    <div className="month-grid">{WEEKDAYS_SHORT.map(w => <span className="weekday" key={w}>{w}</span>)}
      {Array.from({ length: count / 7 }, (_, week) => <div className="month-row" key={week}>{Array.from({ length: 7 }, (_, day) => {
        const date = addDays(start, week * 7 + day)
        const marks = kinds?.(date) || []
        const label = parseISO(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
        return <button type="button" key={date} aria-current={date === today ? 'date' : undefined} aria-label={`${label}${date === today ? ', сегодня' : ''}${marks.length ? ', ' + marks.map(kind => kindName[kind]).join(', ') : ''}`} aria-pressed={value === date} className={`calendar-date ${date === value ? 'selected' : ''} ${date === today ? 'today' : ''} ${date < first || date > last ? 'outside' : ''}`} onClick={() => onChange(date)}>{parseISO(date).getDate()}<span className="lesson-marks" aria-hidden="true">{marks.map(kind => <i key={kind} className={`mark-${kind}`} />)}</span></button>
      })}</div>)}
    </div>
  </div>
}

export function Editor({ draft, today, save, remove, close }: { draft: Draft; today: string; save: (draft: Draft) => void; remove: (id: string) => void; close: () => void }) {
  const [value, setValue] = useState(() => {
    const lesson = taskLesson(draft, lessonsOn(draft.due, DEFAULT_LESSONS, ANCHOR_MONDAY))
    return lesson ? { ...draft, kind: lesson.kind, lessonId: lesson.id } : draft
  })
  const [picking, setPicking] = useState(false)
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const returnFromPicker = () => { clearTimeout(selectionTimer.current); setPicking(false) }
  useEffect(() => () => clearTimeout(selectionTimer.current), [])
  const subjectButton = useRef<HTMLButtonElement>(null)
  const subjectList = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (picking) subjectList.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true })
    else subjectButton.current?.focus({ preventScroll: true })
  }, [picking])
  const note = isDayNote(value)
  const dayLessons = lessonsOn(value.due, DEFAULT_LESSONS, ANCHOR_MONDAY)
  const choices = homeworkLessons(value.subjectId, dayLessons)
  const availableKinds = [...new Set(homeworkLessons(value.subjectId, DEFAULT_LESSONS).map(l => l.kind))]
  const candidates = homeworkLessons(value.subjectId, dayLessons, value.kind)
  const selected = taskLesson(value, dayLessons)
  const needsChoice = !note && candidates.length > 1 && !selected
  const dates = !note && isHomeworkKind(value.kind) ? nextLessonDates(value.subjectId, value.due, DEFAULT_LESSONS, ANCHOR_MONDAY, 2, { kind: value.kind }) : []
  const marks = (date: string) => [...new Set(homeworkLessons(value.subjectId, lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY)).map(l => l.kind))]
  const changeContext = (patch: Partial<Draft>) => {
    const next = { ...value, ...patch, lessonId: undefined }
    if (isDayNote(next)) { setValue({ ...next, kind: undefined }); return }
    const matching = homeworkLessons(next.subjectId, lessonsOn(next.due, DEFAULT_LESSONS, ANCHOR_MONDAY), next.kind)
    const same = matching.find(l => l.id === value.lessonId) ?? (matching.length === 1 ? matching[0] : undefined)
    if (same) setValue({ ...next, kind: same.kind, lessonId: same.id })
    else setValue(next)
  }
  const pickSubject = (subjectId: string) => {
    if (subjectId !== value.subjectId) {
      const kinds = [...new Set(homeworkLessons(subjectId, DEFAULT_LESSONS).map(l => l.kind))]
      changeContext({ subjectId, kind: kinds.length === 1 ? kinds[0] : undefined })
    }
    clearTimeout(selectionTimer.current)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPicking(false)
    else selectionTimer.current = setTimeout(() => setPicking(false), 150)
  }
  const finish = () => {
    if (!value.title.trim() || needsChoice) return
    // Старое отсутствующее lessonId сохраняет несопоставленную запись, пока пользователь не выберет пару.
    if (note) { save({ ...value, entryType: 'note', title: value.title.trim(), kind: undefined, lessonId: undefined }); return }
    save({ ...value, title: value.title.trim(), kind: selected?.kind ?? value.kind, lessonId: selected?.id ?? value.lessonId })
  }
  return <Modal title={picking ? 'Выбрать предмет' : note ? (draft.id ? 'Редактировать заметку' : 'Новая заметка') : draft.id ? 'Редактировать задание' : 'Новое задание'} onClose={() => picking ? returnFromPicker() : close()}>
    {picking && <div className="subject-picker" ref={subjectList}>
      {[{ id: '', label: 'Без предмета' }, ...DEFAULT_SUBJECTS.map(s => ({ id: s.id, label: subjectName(s.id) }))].map(s => <button key={s.id} type="button" aria-pressed={value.subjectId === s.id} onClick={() => pickSubject(s.id)}><span>{s.label}</span>{value.subjectId === s.id && <IconCheck size={20} />}</button>)}
    </div>}
    <form hidden={picking} onSubmit={e => { e.preventDefault(); finish() }}>
      <div className="editor-fields">
        <div className="theme-options" aria-label="Тип записи"><button type="button" aria-pressed={!note} onClick={() => changeContext({ entryType: 'homework', kind: undefined })}>ДЗ</button><button type="button" aria-pressed={note} onClick={() => changeContext({ entryType: 'note', kind: undefined })}>Заметка</button></div>
        <div className="field"><span id="subject-label">Предмет</span><button ref={subjectButton} type="button" className="subject-trigger" aria-labelledby="subject-label subject-value" aria-expanded={picking} onClick={() => setPicking(true)}><span id="subject-value">{value.subjectId ? subjectName(value.subjectId) : 'Без предмета'}</span><IconChevronRight size={18} /></button></div>
        <label className="field">{note ? 'Текст заметки' : 'Что нужно сделать'}<textarea placeholder="Например, решить задачи 12–18" rows={3} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} required /></label>
        {!note && availableKinds.length > 0 && <div className="kind-options" aria-label="Вид занятия">{availableKinds.map(kind => <button type="button" key={kind} className={`kind-${kind}`} aria-pressed={value.kind === kind} onClick={() => changeContext({ kind })}>{kind === 'lab' ? 'Лаба' : 'Семинар'}</button>)}</div>}
        <div className="date-field-title"><span>{note ? 'На день' : 'Сдать к'}</span><strong>{formatDayMonth(value.due)}</strong></div>
        {dates.length > 0 && <div className="date-presets">{dates.map((date, i) => <button type="button" key={date} onClick={() => changeContext({ due: date })}>{value.kind === 'lab' ? (i === 0 ? 'Ближайший день лаб' : 'Следующий день лаб') : (i === 0 ? 'Следующий семинар' : 'Семинар после него')}<span>{formatDayMonth(date)}</span></button>)}</div>}
        <Calendar today={today} value={value.due} onChange={due => changeContext({ due })} kinds={note ? undefined : marks} />
        {!note && value.subjectId && <div className="calendar-legend"><span><i className="mark-seminar" />Семинар</span><span><i className="mark-lab" />Лаба</span></div>}
        {!note && choices.length > 0 && <fieldset className="lesson-choices"><legend>{needsChoice ? 'Выбери время пары' : 'Занятие в этот день'}</legend>{choices.map(l => <button type="button" key={l.id} className={`kind-${l.kind}`} aria-pressed={value.lessonId === l.id} onClick={() => setValue({ ...value, kind: l.kind, lessonId: l.id })}><span>{l.kind === 'lab' ? 'Лаба' : 'Семинар'} · {l.start}–{l.end}</span>{value.lessonId === l.id && <IconCheck size={18} />}</button>)}</fieldset>}
        {!note && value.subjectId && !selected && <p className="binding-hint">{needsChoice ? 'В этот день несколько пар — выбери нужную.' : choices.length ? 'Можно выбрать пару выше или сохранить задание на эту дату без привязки.' : 'Подходящей пары в этот день нет. Задание останется на выбранной дате без привязки.'}</p>}
        {selected?.kind === 'lecture' && <p className="binding-hint">Прежняя привязка к лекции сохранена. Для смены выбери семинар или лабу.</p>}
      </div>
      <footer className="editor-footer">{draft.id && <button type="button" className="icon-button delete-button" aria-label="Удалить задание" onClick={() => remove(draft.id!)}><IconTrash /></button>}<button className="primary-button" disabled={!value.title.trim() || needsChoice} type="submit">{draft.id ? 'Сохранить' : note ? 'Добавить заметку' : 'Добавить задание'}<IconCheck size={18} /></button></footer>
    </form>
  </Modal>
}
