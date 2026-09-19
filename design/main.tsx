import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Lesson, LessonKind } from '../src/types'
import { addDays, diffDays, formatDayMonth, humanDue, mondayOf, parseISO, plural, toISO, WEEKDAYS_SHORT, MONTHS_NOM } from '../src/lib/dates'
import { lessonsOn, nextLessonDates, parityOf } from '../src/lib/week'
import { IconList, IconCalendar, IconSettings, IconPlus, IconCheck, IconX, IconChevronLeft, IconChevronRight, IconChevronDown, IconTrash } from '../src/components/icons'
import { ANCHOR_MONDAY, CONCEPTS, DEFAULT_LESSONS, DEFAULT_SUBJECTS, INITIAL_TASKS, TODAY, type DemoTask } from './data'
import './style.css'

type Tab = 'tasks' | 'schedule' | 'settings'
type Draft = Omit<DemoTask, 'id' | 'done'> & { id?: string; locked?: boolean }
const subject = (id: string) => DEFAULT_SUBJECTS.find(s => s.id === id)
const subjectName = (id: string) => subject(id)?.short || subject(id)?.name || 'Личное'
const tone = (id: string, kind?: LessonKind) => kind === 'lab' ? 'lab' : subject(id)?.assessment || 'other'
const kindName = { lecture: 'Лекция', seminar: 'Семинар', lab: 'Лабораторная', other: 'Занятие' }
const query = new URLSearchParams(location.search)
const capture = query.get('capture') === '1'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} className="sheet" onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }} aria-label={title}>
    <div className="sheet-inner"><header><h2>{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}><IconX /></button></header>{children}</div>
  </dialog>
}

function Calendar({ value, onChange, match }: { value: string; onChange: (date: string) => void; match?: (date: string) => boolean }) {
  const [month, setMonth] = useState(value)
  useEffect(() => { setMonth(value) }, [value])
  const d = parseISO(month)
  const first = toISO(new Date(d.getFullYear(), d.getMonth(), 1))
  const last = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  const start = mondayOf(first)
  const count = Math.ceil((diffDays(start, last) + 1) / 7) * 7
  const shift = (n: number) => setMonth(toISO(new Date(d.getFullYear(), d.getMonth() + n, 1)))
  return <div className="month-calendar">
    <div className="month-title"><button type="button" className="icon-button" onClick={() => shift(-1)} aria-label="Предыдущий месяц"><IconChevronLeft size={18} /></button><strong>{MONTHS_NOM[d.getMonth()]} {d.getFullYear()}</strong><button type="button" className="icon-button" onClick={() => shift(1)} aria-label="Следующий месяц"><IconChevronRight size={18} /></button></div>
    <div className="month-grid"><span />{WEEKDAYS_SHORT.map(w => <span className="weekday" key={w}>{w}</span>)}
      {Array.from({ length: count / 7 }, (_, week) => <div className="month-row" key={week}><span className="parity-label">{parityOf(addDays(start, week * 7), ANCHOR_MONDAY) === 'num' ? 'Ч' : 'З'}</span>{Array.from({ length: 7 }, (_, day) => {
        const date = addDays(start, week * 7 + day)
        return <button type="button" key={date} aria-label={formatDayMonth(date)} aria-pressed={value === date} className={`calendar-date ${date === value ? 'selected' : ''} ${date === TODAY ? 'today' : ''} ${date < first || date > last ? 'outside' : ''} ${match?.(date) ? 'has-lesson' : ''}`} onClick={() => onChange(date)}>{parseISO(date).getDate()}</button>
      })}</div>)}
    </div>
  </div>
}

function Editor({ draft, save, remove, close }: { draft: Draft; save: (draft: Draft) => void; remove: (id: string) => void; close: () => void }) {
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

function App() {
  const [variant, setVariant] = useState(query.get('variant') || 'a')
  const concept = CONCEPTS.find(c => c.id === variant) || CONCEPTS[0]
  const [dark, setDark] = useState(query.get('theme') === 'dark')
  const [tab, setTab] = useState<Tab>(query.get('screen') === 'schedule' ? 'schedule' : query.get('screen') === 'settings' ? 'settings' : 'tasks')
  const [tasks, setTasks] = useState<DemoTask[]>(INITIAL_TASKS)
  const [filter, setFilter] = useState('all')
  const [keepDone, setKeepDone] = useState(true)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [date, setDate] = useState(TODAY)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [panel, setPanel] = useState<'subjects' | 'about' | null>(null)
  const [removed, setRemoved] = useState<DemoTask | null>(null)
  const [notice, setNotice] = useState('')
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.documentElement.dataset.variant = concept.id }, [dark, concept.id])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 2500); return () => clearTimeout(timer) }, [notice])
  const remaining = tasks.filter(t => !t.done).length
  const todayTasks = tasks.filter(t => !t.done && t.due === TODAY).length
  const changeVariant = (id: string) => { setVariant(id); const url = new URL(location.href); url.searchParams.set('variant', id); history.replaceState(null, '', url) }
  const toggle = (id: string) => setTasks(items => items.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const openNew = (lesson?: Lesson) => setDraft({ subjectId: lesson?.subjectId || '', title: '', due: tab === 'schedule' ? date : TODAY, kind: lesson?.kind, lessonId: lesson?.id, locked: Boolean(lesson) })
  const save = (value: Draft) => {
    setTasks(items => value.id ? items.map(t => t.id === value.id ? { ...t, ...value } : t) : [...items, { ...value, id: crypto.randomUUID(), done: false }])
    setDraft(null); setNotice(value.id ? 'Изменения сохранены' : 'Задание добавлено')
  }
  const remove = (id: string) => { setRemoved(tasks.find(t => t.id === id) || null); setTasks(items => items.filter(t => t.id !== id)); setDraft(null) }

  function TaskRow({ task }: { task: DemoTask }) {
    return <div className={`task-row ${task.done ? 'completed' : ''} tone-${tone(task.subjectId, task.kind)}`}>
      <button className="check-button" onClick={() => toggle(task.id)} aria-label={`${task.done ? 'Вернуть' : 'Выполнить'}: ${task.title}`} aria-pressed={task.done}><span>{task.done && <IconCheck size={13} />}</span></button>
      <button className="task-content" onClick={() => setDraft({ ...task })}><span className="task-subject"><i />{subjectName(task.subjectId)}</span><span className="task-title">{task.title}</span></button>
      {concept.id === 'c' && <span className="task-arrow" aria-hidden="true">↗</span>}
    </div>
  }

  function Tasks() {
    const visible = tasks.filter(t => filter === 'done' ? t.done : filter === 'open' || !keepDone ? !t.done : true)
    const groups = [
      { key: 'overdue', name: 'Просрочено', test: (due: string) => due < TODAY },
      { key: 'current', name: 'Актуальная неделя', test: (due: string) => due >= TODAY && due <= '2026-09-27' },
      { key: 'next', name: 'Следующая неделя', test: (due: string) => due >= '2026-09-28' && due <= '2026-10-04' },
      { key: 'later', name: 'Больше недели', test: (due: string) => due > '2026-10-04' },
    ]
    return <>
      <div className="page-intro"><div><p className="eyebrow">ПОНЕДЕЛЬНИК, 21 СЕНТЯБРЯ</p><h1>{concept.id === 'b' ? <>Всё по <em>порядку.</em></> : concept.id === 'c' ? <>ПЛАН<span className="title-mark">/</span>ДЕЛ</> : 'Задачи'}</h1><p className="intro-caption">{concept.id === 'b' ? `Сегодня ${todayTasks} ${plural(todayTasks, 'задача', 'задачи', 'задач')}. Можно без спешки.` : `${remaining} ${plural(remaining, 'задание', 'задания', 'заданий')} впереди · знаменатель`}</p></div>{concept.id !== 'b' && <span className="intro-number">{String(remaining).padStart(2, '0')}</span>}</div>
      <div className="task-filters" aria-label="Показать задания">{[['all', 'Все'], ['open', 'В работе'], ['done', 'Готово']].map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}{id === 'done' && <span>{tasks.filter(t => t.done).length}</span>}</button>)}</div>
      {!visible.length && <div className="empty-state"><IconCheck size={32} /><h2>{filter === 'done' ? 'Пока ничего не отмечено' : 'Здесь всё сделано'}</h2><p>Новое задание можно добавить кнопкой ниже.</p></div>}
      {groups.map((group, index) => {
        const entries = visible.filter(t => group.test(t.due)).sort((a, b) => a.due.localeCompare(b.due))
        if (!entries.length) return null
        const days = [...new Set(entries.map(t => t.due))]
        const shut = collapsed.includes(group.key)
        return <section className={`task-section ${group.key}`} key={group.key}>
          <button className="section-heading" onClick={() => setCollapsed(v => v.includes(group.key) ? v.filter(k => k !== group.key) : [...v, group.key])} aria-expanded={!shut}>{concept.id === 'c' && <span className="section-index">0{index + 1}</span>}<h2>{group.name}</h2><span className="count">{entries.filter(t => !t.done).length}</span><IconChevronDown size={16} className={shut ? 'rotated' : ''} /></button>
          {!shut && days.map(day => <div className="day-group" key={day}><div className="day-label"><strong>{parseISO(day).getDate()}</strong><span>{WEEKDAYS_SHORT[(parseISO(day).getDay() + 6) % 7]}</span><small>{parseISO(day).getMonth() !== 8 ? 'октября' : 'сентября'}</small></div><div className="day-content"><div className={`due-label ${day < TODAY ? 'late' : ''}`}>{humanDue(day, TODAY)}</div><div className="day-tasks">{entries.filter(t => t.due === day).map(t => <TaskRow key={t.id} task={t} />)}</div></div></div>)}
        </section>
      })}
      <p className="end-note">В твоём темпе. По одной задаче.</p>
    </>
  }

  function Schedule() {
    const lessons = lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY)
    const week = mondayOf(date)
    const ownTasks = tasks.filter(t => t.due === date)
    const assigned = new Set<string>()
    return <>
      <div className="page-intro schedule-intro"><div><p className="eyebrow">{parityOf(date, ANCHOR_MONDAY) === 'num' ? 'ЧИСЛИТЕЛЬ' : 'ЗНАМЕНАТЕЛЬ'} · УЧЕБНАЯ НЕДЕЛЯ</p><h1>{date === TODAY ? 'Сегодня' : formatDayMonth(date)}</h1><p className="intro-caption">{date === TODAY ? '21 сентября · понедельник' : `${WEEKDAYS_SHORT[(parseISO(date).getDay() + 6) % 7]} · ${lessons.length} ${plural(lessons.length, 'пара', 'пары', 'пар')}`}</p></div><button className={`icon-button calendar-toggle ${calendarOpen ? 'active' : ''}`} onClick={() => setCalendarOpen(v => !v)} aria-label="Показать календарь" aria-expanded={calendarOpen}><IconCalendar /></button></div>
      {calendarOpen && <Calendar value={date} onChange={d => { setDate(d); setCalendarOpen(false) }} match={d => tasks.some(t => t.due === d && !t.done)} />}
      <div className="week-strip">{Array.from({ length: 7 }, (_, i) => { const d = addDays(week, i); return <button key={d} className={d === date ? 'selected' : ''} onClick={() => setDate(d)} aria-label={`Открыть ${formatDayMonth(d)}`} aria-pressed={date === d}><small>{WEEKDAYS_SHORT[i]}</small><strong>{parseISO(d).getDate()}</strong><i className={tasks.some(t => t.due === d && !t.done) ? 'has-task' : ''} /></button> })}</div>
      <div className="schedule-controls"><button className="icon-button" aria-label="Предыдущий день" onClick={() => setDate(addDays(date, -1))}><IconChevronLeft size={18} /></button><button className="today-link" onClick={() => setDate(TODAY)}>{date === TODAY ? `${lessons.length} пары в расписании` : 'Вернуться к сегодня'}</button><button className="icon-button" aria-label="Следующий день" onClick={() => setDate(addDays(date, 1))}><IconChevronRight size={18} /></button></div>
      <div className="lessons">{lessons.map(lesson => {
        const attached = ownTasks.filter(t => t.lessonId ? t.lessonId === lesson.id : t.subjectId === lesson.subjectId && !assigned.has(t.id))
        attached.forEach(t => assigned.add(t.id))
        return <div className={`lesson tone-${tone(lesson.subjectId, lesson.kind)} ${lesson.subjectId === 'vuc' ? 'long-lesson' : ''}`} key={lesson.id}>
          <div className="lesson-time"><strong>{lesson.start}</strong><span>{lesson.end}</span><i /></div><div className="lesson-body"><div className="lesson-top"><span className="lesson-kind">{kindName[lesson.kind]}</span><button className="icon-button lesson-add" aria-label={`Добавить: ${subjectName(lesson.subjectId)}, ${kindName[lesson.kind]}, ${lesson.start}`} onClick={() => openNew(lesson)}><IconPlus size={18} /></button></div><h2>{subjectName(lesson.subjectId)}</h2><p className="lesson-meta">{[lesson.room, lesson.building].filter(Boolean).join(' · ') || 'Учебный день'}</p>{lesson.teacher && <p className="lesson-teacher">{lesson.teacher}</p>}{attached.map(t => <TaskRow key={t.id} task={t} />)}</div>
        </div>
      })}</div>
      {ownTasks.filter(t => !assigned.has(t.id)).length > 0 && <section className="day-extra"><h2>Сдать в этот день</h2>{ownTasks.filter(t => !assigned.has(t.id)).map(t => <TaskRow key={t.id} task={t} />)}</section>}
      {!lessons.length && <div className="empty-state"><IconCalendar size={32} /><h2>День без пар</h2><p>Можно выдохнуть. Или добавить личное дело.</p></div>}
    </>
  }

  function Settings() {
    return <><div className="page-intro"><div><p className="eyebrow">ПОД СЕБЯ</p><h1>Настройки</h1><p className="intro-caption">Меньше лишнего, больше удобства.</p></div></div><div className="profile"><span className="avatar">А</span><div><strong>Мой учебный план</strong><p>11 предметов · 28 занятий</p></div><span className="profile-mark">дз.</span></div>
      <section className="settings-group"><h2>Оформление</h2><button className="setting-row" role="switch" aria-checked={dark} onClick={() => setDark(!dark)}><span><strong>Тёмная тема</strong><small>Для поздних учебных вечеров</small></span><span className={`switch ${dark ? 'on' : ''}`} /></button><button className="setting-row" role="switch" aria-checked={keepDone} onClick={() => setKeepDone(!keepDone)}><span><strong>Показывать выполненные</strong><small>Пусть маленькие победы остаются</small></span><span className={`switch ${keepDone ? 'on' : ''}`} /></button></section>
      <section className="settings-group"><h2>Учёба</h2><button className="setting-row" onClick={() => setPanel('subjects')}><span><strong>Предметы</strong><small>Виды аттестации и обозначения</small></span><span className="setting-end">11 <IconChevronRight size={18} /></span></button><button className="setting-row" onClick={() => { setTab('schedule'); setCalendarOpen(true) }}><span><strong>Расписание</strong><small>Числитель и знаменатель</small></span><IconChevronRight size={18} /></button></section>
      <button className="about-button" onClick={() => setPanel('about')}>ДЗ · маленький помощник в большой учёбе <IconChevronRight size={15} /></button>
    </>
  }

  return <div className={`design-workspace ${capture ? 'capture' : ''}`}>
    {!capture && <header className="workbench"><a href="?variant=a" className="workbench-brand">ДЗ<span> / дизайн</span></a><div className="variant-switcher" aria-label="Вариант дизайна">{CONCEPTS.map(c => <button key={c.id} aria-pressed={concept.id === c.id} onClick={() => changeVariant(c.id)} className={concept.id === c.id ? 'active' : ''}><span>{c.id.toUpperCase()}</span>{c.name}</button>)}</div><button className="theme-button" onClick={() => setDark(!dark)} aria-label={dark ? 'Светлая тема' : 'Тёмная тема'}>{dark ? '◑' : '◐'}<span>{dark ? 'Светлая' : 'Тёмная'}</span></button></header>}
    <div className="studio-body">
      {!capture && <aside className="concept-info"><p className="studio-kicker">ТРИ НАПРАВЛЕНИЯ / СЕНТЯБРЬ 2026</p><span className="concept-number">{concept.number}</span><h2>{concept.name}<span>.</span></h2><p className="concept-subtitle">{concept.subtitle}</p><p>{concept.description}</p><div className="concept-tags">{concept.tags.map(t => <span key={t}>{t}</span>)}</div><p className="concept-detail">{concept.detail}</p><div className="demo-note"><span className="live-dot" />Интерактивный макет<p>Можно переключать вкладки, добавлять и отмечать задания. Изменения живут только до перезагрузки.</p><button onClick={() => { setTasks(INITIAL_TASKS); setFilter('all'); setCollapsed([]); setDate(TODAY); setRemoved(null); setNotice('Демо восстановлено') }}>Сбросить примеры ↺</button></div></aside>}
      <div className="app-frame">
        <div className="app-masthead"><span className="app-logo">дз<span>.</span></span><span className="semester">ОСЕННИЙ СЕМЕСТР <i /> 2026</span><span className="mini-avatar">А</span></div>
        <main key={tab} className="app-scroll">{tab === 'tasks' ? <Tasks /> : tab === 'schedule' ? <Schedule /> : <Settings />}</main>
        {tab !== 'settings' && <button className="add-button" aria-label="Добавить задание" onClick={() => openNew()}><IconPlus size={22} /><span>Добавить</span></button>}
        <nav className="app-nav" aria-label="Основные вкладки">{([{ key: 'tasks', label: 'Задачи', icon: IconList }, { key: 'schedule', label: 'Расписание', icon: IconCalendar }, { key: 'settings', label: 'Настройки', icon: IconSettings }] as const).map(item => <button key={item.key} aria-current={tab === item.key ? 'page' : undefined} className={tab === item.key ? 'selected' : ''} onClick={() => { setTab(item.key); if (item.key === 'schedule') setDate(TODAY) }}><item.icon size={21} /><span>{item.label}</span></button>)}</nav>
        {removed ? <div className="toast">Задание удалено<button onClick={() => { setTasks(items => [...items, removed]); setRemoved(null) }}>Отменить</button><button aria-label="Закрыть сообщение" onClick={() => setRemoved(null)}><IconX size={16} /></button></div> : notice && <div className="toast" role="status">{notice}<IconCheck size={18} /></div>}
      </div>
    </div>
    {draft && <Editor draft={draft} save={save} remove={remove} close={() => setDraft(null)} />}
    {panel && <Modal title={panel === 'subjects' ? 'Мои предметы' : 'ДЗ'} onClose={() => setPanel(null)}><div className="info-panel">{panel === 'subjects' ? <><p>Цвет помогает различать виды аттестации.</p>{DEFAULT_SUBJECTS.map(s => <div key={s.id} className={`subject-row tone-${s.assessment}`}><span className="subject-dot" /><div><strong>{s.name}</strong><small>{{ exam: 'Экзамен', dist: 'Распределённый экзамен', credit: 'Зачёт', other: 'Без аттестации' }[s.assessment]}</small></div></div>)}</> : <><h3>Учёба, чуть спокойнее.</h3><p>Задания, расписание и важные сроки в одном месте.</p><p>Вариант «{concept.name}» · превью 1.21.0</p></>}</div></Modal>}
  </div>
}

function Comparison() {
  const [dark, setDark] = useState(false)
  const [screen, setScreen] = useState('tasks')
  return <div className="comparison-page"><header><div><p>ДЗ / НАПРАВЛЕНИЯ ДИЗАЙНА</p><h1>Три взгляда на учебный день.</h1></div><div className="comparison-controls"><select aria-label="Экран для сравнения" value={screen} onChange={e => setScreen(e.target.value)}><option value="tasks">Задачи</option><option value="schedule">Расписание</option><option value="settings">Настройки</option></select><button onClick={() => setDark(!dark)}>{dark ? 'Светлая тема' : 'Тёмная тема'}</button></div></header><div className="comparison-grid">{CONCEPTS.map(c => <section key={c.id}><div className="comparison-label"><span>{c.id.toUpperCase()}</span><div><h2>{c.name}</h2><p>{c.subtitle}</p></div><a href={`?variant=${c.id}`}>Открыть ↗</a></div><iframe title={`Вариант ${c.name}`} src={`?variant=${c.id}&capture=1&theme=${dark ? 'dark' : 'light'}&screen=${screen}`} /></section>)}</div><footer>Одинаковые задания и расписание · интерактивные макеты · 21 сентября 2026</footer></div>
}

createRoot(document.getElementById('root')!).render(query.get('compare') === '1' ? <Comparison /> : <App />)
