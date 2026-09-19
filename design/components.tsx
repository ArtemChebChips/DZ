import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addDays, diffDays, formatDayMonth, mondayOf, parseISO, toISO, WEEKDAYS_SHORT, MONTHS_NOM } from '../src/lib/dates'
import { lessonsOn, nextLessonDates } from '../src/lib/week'
import { IconCheck, IconX, IconChevronLeft, IconChevronRight, IconTrash } from '../src/components/icons'
import { ANCHOR_MONDAY, DEFAULT_LESSONS, DEFAULT_SUBJECTS, TODAY, subjectName, kindName, type Draft } from './data'
const tone = (id: string, kind?: string) => kind === 'lab' ? 'lab' : DEFAULT_SUBJECTS.find(s => s.id === id)?.assessment || 'other'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} className="sheet" onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }} aria-label={title}>
    <div className="sheet-inner"><header><h2>{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}><IconX /></button></header>{children}</div>
  </dialog>
}

export function Calendar({ value, onChange, match }: { value: string; onChange: (date: string) => void; match?: (date: string) => boolean }) {
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
        return <button type="button" key={date} aria-label={parseISO(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} aria-pressed={value === date} className={`calendar-date ${date === value ? 'selected' : ''} ${date === TODAY ? 'today' : ''} ${date < first || date > last ? 'outside' : ''} ${match?.(date) ? 'has-lesson' : ''}`} onClick={() => onChange(date)}>{parseISO(date).getDate()}</button>
      })}</div>)}
    </div>
  </div>
}

export function Editor({ draft, save, remove, close }: { draft: Draft; save: (draft: Draft) => void; remove: (id: string) => void; close: () => void }) {
  const [value, setValue] = useState(draft)
  const dates = value.subjectId ? nextLessonDates(value.subjectId, draft.due, DEFAULT_LESSONS, ANCHOR_MONDAY, 2, { kind: value.kind }) : []
  const matches = (date: string) => lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY).some(l => l.subjectId === value.subjectId && (!value.kind || l.kind === value.kind))
  return <Modal title={draft.id ? 'Редактировать задание' : 'Новое задание'} onClose={close}>
    <form onSubmit={e => { e.preventDefault(); if (value.title.trim()) save({ ...value, title: value.title.trim() }) }}>
      <div className="editor-fields">
        {draft.locked ? <div className={`locked-subject tone-${tone(value.subjectId, value.kind)}`}><span className="subject-dot" /><strong>{subjectName(value.subjectId)}</strong><small>{value.kind ? kindName[value.kind] : ''}</small></div> : <label className="field">Предмет<select value={value.subjectId} onChange={e => setValue({ ...value, subjectId: e.target.value, lessonId: undefined, kind: undefined })}><option value="">Без предмета</option>{DEFAULT_SUBJECTS.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
        <label className="field">Что нужно сделать<textarea placeholder="Например, решить задачи 12–18" rows={3} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} required /></label>
        <div className="date-field-title"><span>Сдать к</span><strong>{formatDayMonth(value.due)}</strong></div>
        {dates.length > 0 && <div className="date-presets">{dates.map((date, i) => <button type="button" key={date} onClick={() => setValue({ ...value, due: date })} aria-pressed={value.due === date}>{i === 0 ? 'Следующая пара' : 'Через одну'}<span>{formatDayMonth(date)}</span></button>)}</div>}
        <Calendar value={value.due} onChange={due => setValue({ ...value, due })} match={matches} />
        {value.subjectId && <p className="calendar-hint"><span /> Обведены дни подходящих занятий</p>}
      </div>
      <footer className="editor-footer">{draft.id && <button type="button" className="icon-button delete-button" aria-label="Удалить задание" onClick={() => remove(draft.id!)}><IconTrash /></button>}<button className="primary-button" disabled={!value.title.trim()} type="submit">{draft.id ? 'Сохранить' : 'Добавить задание'}<IconCheck size={18} /></button></footer>
    </form>
  </Modal>
}

