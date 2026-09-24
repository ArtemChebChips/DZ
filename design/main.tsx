import { useEffect, useLayoutEffect, useRef, useState, type SetStateAction } from 'react'
import { createRoot } from 'react-dom/client'
import type { Lesson } from '../src/types'
import { addDays, parseISO } from '../src/lib/dates'
import { lessonsOn, parityOf } from '../src/lib/week'
import { IconList, IconCalendar, IconSettings, IconPlus, IconCheck, IconChevronRight, IconChevronDown, IconChevronLeft, IconChevronRight as IconDayNext, IconX } from '../src/components/icons'
import { Calendar, Editor, Modal } from './components'
import { ANCHOR_MONDAY, IS_DEMO, DEFAULT_LESSONS, DEFAULT_SUBJECTS, INITIAL_TASKS, EXTRA_TASKS, subjectName, kindName, type DemoTask, type Draft } from './data'
import { version } from '../package.json'
import { useNotebook, downloadBackup, STORAGE_KEY } from './storage'
import { taskLesson, isHomeworkKind, isDayNote } from './homework'
import { useToday, currentDay } from './use-today'
import { generateTestTasks, isTestTask, withoutTestTasks } from './test-tasks'
import { useScrollBoundary } from './use-scroll-boundary'
import './style.css'
import './register-sw'

type Tab = 'tasks' | 'schedule' | 'settings'
type Theme = 'light' | 'dark' | 'system'
type Panel = 'subjects' | 'backup' | 'about' | 'beta' | null
const query = new URLSearchParams(location.search)
const longDate = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const weekday = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { weekday: 'long' })
const relativeDate = (date: string, today: string) => date < today ? 'Просрочено' : date === today ? 'Сегодня' : date === addDays(today, 1) ? 'Завтра' : 'Позже'

function SettingIcon({ kind }: { kind: 'book' | 'cloud' | 'info' | 'sun' }) {
  return <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'book' ? <><path d="M12 5C9 3 5 3 2 5v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0Z" /><path d="M12 5v15" /></> : kind === 'cloud' ? <path d="M7 19h11a4 4 0 0 0 1-7.87A6 6 0 0 0 7.2 9 5 5 0 0 0 7 19Z" /> : kind === 'info' ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
  </svg>
}

function TaskRow({ task, toggle, edit }: { task: DemoTask; toggle: (id: string) => void; edit: (task: DemoTask) => void }) {
  return <div className={`task-row ${task.done ? 'completed' : ''}`}>
    <button className="check-button" onClick={() => toggle(task.id)} aria-label={`${task.done ? 'Вернуть' : 'Выполнить'}: ${task.title}`} aria-pressed={task.done}><span>{task.done && <IconCheck size={17} />}</span></button>
    <button className="task-content" onClick={() => edit(task)}><span className="task-subject">{isDayNote(task) ? `Заметка${task.subjectId ? ' · ' + subjectName(task.subjectId) : ''}` : subjectName(task.subjectId)}</span><span className="task-title">{task.title}</span><IconChevronRight size={16} /></button>
  </div>
}

function App() {
  const today = useToday()
  const previousToday = useRef(today)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<Tab>(query.get('screen') === 'schedule' ? 'schedule' : query.get('screen') === 'settings' ? 'settings' : 'tasks')
  const notebook = useNotebook(IS_DEMO ? { version: 1, theme: query.get('theme') === 'dark' ? 'dark' : 'light', tasks: query.get('fixture') === 'empty' ? [] : query.get('fixture') === 'stress' ? [...INITIAL_TASKS, ...EXTRA_TASKS] : INITIAL_TASKS, collapsed: [] } : null)
  const { tasks, theme, collapsed } = notebook.data
  const setTasks = (value: SetStateAction<DemoTask[]>) => notebook.update(current => ({ ...current, tasks: typeof value === 'function' ? value(current.tasks) : value }))
  const setTheme = (theme: Theme) => notebook.update(current => ({ ...current, theme }))
  const setCollapsed = (value: SetStateAction<string[]>) => notebook.update(current => ({ ...current, collapsed: typeof value === 'function' ? value(current.collapsed) : value }))
  const backup = () => downloadBackup(JSON.stringify(notebook.data, null, 2), `dz-${today}.json`)
  const recoverRaw = () => { try { downloadBackup(localStorage.getItem(STORAGE_KEY) || '{}', `dz-recovery-${today}.json`) } catch { setNotice('Браузер не даёт прочитать данные устройства') } }
  const [showDone, setShowDone] = useState(false)
  const [date, setDate] = useState(today)
  const [dayDirection, setDayDirection] = useState(1)
  const selectDay = (next: string) => { setDayDirection(next < date ? -1 : 1); setDate(next); mainRef.current?.scrollTo({ top: 0 }) }
  const shiftDay = (direction: -1 | 1) => { setDayDirection(direction); setDate(current => addDays(current, direction)); mainRef.current?.scrollTo({ top: 0 }) }
  useScrollBoundary(tab === 'schedule' && !calendarOpen ? shiftDay : undefined)
  useEffect(() => {
    const previous = previousToday.current
    setDate(selected => selected === previous ? today : selected)
    previousToday.current = today
  }, [today])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [betaDeleted, setBetaDeleted] = useState<number | null>(null)
  const [removed, setRemoved] = useState<DemoTask | null>(null)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme }
    apply(); media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 2500); return () => clearTimeout(timer) }, [notice])
  const toggle = (id: string) => setTasks(items => items.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const openNew = (lesson?: Lesson) => setDraft({ entryType: 'homework', subjectId: lesson?.subjectId || '', title: '', due: tab === 'schedule' ? date : today, kind: lesson?.kind, lessonId: lesson?.id, locked: Boolean(lesson) })
  const save = (value: Draft) => {
    const { locked: _locked, ...record } = value
    setTasks(items => record.id ? items.map(t => t.id === record.id ? { ...t, ...record } : t) : [...items, { ...record, id: crypto.randomUUID(), done: false }])
    setDraft(null); setNotice(value.id ? 'Изменения сохранены' : isDayNote(value) ? 'Заметка добавлена' : 'Задание добавлено')
  }
  const remove = (id: string) => { setRemoved(tasks.find(t => t.id === id) || null); setTasks(items => items.filter(t => t.id !== id)); setDraft(null) }
  const testCount = tasks.filter(isTestTask).length
  const generateExamples = () => {
    const days = Array.from({ length: 21 }, (_, i) => {
      const date = addDays(today, i)
      return { date, lessons: lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY) }
    })
    const generated = generateTestTasks(days, crypto.randomUUID())
    setTasks(items => [...withoutTestTasks(items), ...generated])
    setRemoved(null); setBetaDeleted(null)
  }
  const deleteExamples = () => {
    setBetaDeleted(testCount)
    setTasks(withoutTestTasks)
    setRemoved(null)
  }
  const visible = tasks.filter(t => !t.done)
  const days = [...new Set(visible.map(t => t.due))].sort()
  const done = tasks.filter(t => t.done)
  const lessons = lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY)
  const ownTasks = tasks.filter(t => t.due === date)
  const assigned = new Set<string>()
  const row = (task: DemoTask) => <TaskRow key={task.id} task={task} toggle={toggle} edit={setDraft} />
  useLayoutEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [tab])
  const changeTab = (next: Tab) => {
    if (next === 'schedule' && tab !== 'schedule') setDate(currentDay())
    setTab(next); mainRef.current?.scrollTo({ top: 0 })
  }

  return <div className="app-shell">
    <nav className="app-nav" aria-label="Основные вкладки">
      <span className="desktop-brand">ДЗ<span>Учебный планер</span></span>
      {([{ key: 'tasks', label: 'Задачи', icon: IconList }, { key: 'schedule', label: 'Расписание', icon: IconCalendar }, { key: 'settings', label: 'Настройки', icon: IconSettings }] as const).map(item => <button key={item.key} aria-current={tab === item.key ? 'page' : undefined} onClick={() => changeTab(item.key)}><item.icon size={25} /><span>{item.label}</span></button>)}
      <span className="desktop-footer">Версия {version}</span>
    </nav>
    <main className={`app-main screen-${tab}`}>
      <div className="screen-header">
      <header className="page-header"><h1>{tab === 'tasks' ? 'Задачи' : tab === 'schedule' ? 'Расписание' : 'Настройки'}</h1></header>
      {tab === 'schedule' && <>
        <div className="agenda-heading"><div className="agenda-date"><h2><span>{weekday(date)}</span><span>{longDate(date)}</span></h2><div className="day-stepper"><button className="icon-button" aria-label="Предыдущий день" onClick={() => shiftDay(-1)}><IconChevronLeft size={18} /></button><p>{parityOf(date, ANCHOR_MONDAY) === 'num' ? 'Числитель' : 'Знаменатель'}</p><button className="icon-button" aria-label="Следующий день" onClick={() => shiftDay(1)}><IconDayNext size={18} /></button></div></div><div className="agenda-controls"><button className="outline-button calendar-toggle" onClick={() => setCalendarOpen(true)}><IconCalendar size={19} />Календарь</button>{date === today ? <span className="today-badge">Сегодня</span> : <button className="outline-button today-button" onClick={() => selectDay(today)}>Сегодня</button>}</div></div>
      </>}
      </div>
      <div ref={mainRef} className="app-scroll" data-scroll-region data-swipe-days={tab === 'schedule' ? '' : undefined}>
      {notebook.error && <div className="storage-warning" role="alert"><p>{notebook.error}</p><button onClick={notebook.blocked ? recoverRaw : backup}>Скачать резервную копию</button></div>}
      {tab === 'tasks' && <div className="task-list">
        {!visible.length && <div className="tasks-empty"><span className="empty-check"><IconCheck size={38} /></span><h2>{tasks.length ? 'Заданий больше нет' : 'Пока нет заданий'}</h2></div>}
        {days.map(day => <section className={`day-section ${day < today ? 'overdue' : ''}`} key={day}>
          <button className="day-heading" onClick={() => setCollapsed(list => list.includes(day) ? list.filter(d => d !== day) : [...list, day])} aria-expanded={!collapsed.includes(day)}>
            <span><span className="relative-date">{relativeDate(day, today)}</span><h2>{longDate(day)}{parseISO(day).getFullYear() !== parseISO(today).getFullYear() && <small> {parseISO(day).getFullYear()}</small>}</h2></span><span className="day-weekday">{weekday(day)}<IconChevronDown size={14} className={collapsed.includes(day) ? 'rotated' : ''} /></span>
          </button>
          {!collapsed.includes(day) && visible.filter(t => t.due === day).map(row)}
        </section>)}
        {done.length > 0 && <section className="done-section"><button className="done-heading" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}><IconCheck size={18} />Выполнено <span>{done.length}</span><IconChevronDown size={16} className={!showDone ? 'rotated' : ''} /></button>{showDone && done.map(row)}</section>}
      </div>}
      {tab === 'schedule' && <div key={date} className={`schedule-layout day-enter day-direction-${dayDirection}`}><section className="agenda">
        {!lessons.length && <div className="empty-state"><IconCalendar size={28} /><h2>День без пар</h2><p>Задания на этот день можно добавить отдельно.</p></div>}
        {lessons.map(lesson => {
          const attached = ownTasks.filter(t => taskLesson(t, lessons)?.id === lesson.id)
          attached.forEach(t => assigned.add(t.id))
          return <article className="lesson" key={lesson.id}><div className="lesson-time"><time>{lesson.start}</time><span>–</span><time>{lesson.end}</time></div><div className="lesson-body"><div className="lesson-title"><h3>{subjectName(lesson.subjectId)}</h3>{isHomeworkKind(lesson.kind) && <button className="icon-button" aria-label={`Добавить: ${subjectName(lesson.subjectId)}, ${kindName[lesson.kind]}, ${lesson.start}`} onClick={() => openNew(lesson)}><IconPlus size={19} /></button>}</div><p>{kindName[lesson.kind]}{lesson.room && ` · ${/^каф\./i.test(lesson.room) ? lesson.room : 'Каб. ' + lesson.room}`}</p>{lesson.teacher && <p className="lesson-detail">{lesson.teacher}</p>}{attached.map(row)}</div></article>
        })}
        {ownTasks.some(t => !isDayNote(t) && !assigned.has(t.id)) && <section className="day-extra"><h3>Без привязки к паре</h3><p className="binding-hint">Открой задание, чтобы выбрать занятие.</p>{ownTasks.filter(t => !isDayNote(t) && !assigned.has(t.id)).map(row)}</section>}
        {ownTasks.some(isDayNote) && <section className="day-extra"><h3>Заметки на день</h3>{ownTasks.filter(isDayNote).map(row)}</section>}
        <div className="agenda-actions"><button className="primary-button" onClick={() => openNew()}><IconPlus size={19} />Добавить задание</button><button className="outline-button" onClick={() => setDraft({ entryType: 'note', subjectId: '', title: '', due: date })}><IconPlus size={19} />Заметка</button></div>
      </section></div>}
      {tab === 'settings' && <div className="settings-list">
        <section className="appearance"><h2>Оформление</h2><div className="theme-options" aria-label="Оформление">{([{ id: 'light', label: 'Светлая' }, { id: 'dark', label: 'Тёмная' }, { id: 'system', label: 'Системная' }] as const).map(t => <button key={t.id} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>{t.label}</button>)}</div></section>
        <button className="setting-row" onClick={() => setPanel('subjects')}><SettingIcon kind="book" /><span><strong>Предметы</strong><small>Список предметов и аттестации</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => changeTab('schedule')}><IconCalendar size={27} /><span><strong>Расписание</strong><small>Учебные недели и время занятий</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => setPanel('backup')}><SettingIcon kind="cloud" /><span><strong>Резервная копия</strong><small>Сохранение и перенос данных</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => setPanel('beta')}><SettingIcon kind="book" /><span><strong>Для бета-тестеров</strong><small>Примеры заданий на три недели</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => setPanel('about')}><SettingIcon kind="info" /><span><strong>О приложении</strong><small>Версия {version}</small></span><IconChevronRight size={18} /></button>
      </div>}
      {IS_DEMO && <details className="preview-tools"><summary>Демонстрационный макет</summary><p>Изменения хранятся до перезагрузки. Сегодня в примерах — 21 сентября 2026.</p><div><button onClick={() => { setTasks(INITIAL_TASKS); setCollapsed([]); setRemoved(null); setShowDone(false) }}>Исходный список</button><button onClick={() => { setTasks([...INITIAL_TASKS, ...EXTRA_TASKS]); setCollapsed([]); setShowDone(true); setRemoved(null) }}>Длинные записи и просрочка</button><button onClick={() => { setTasks([]); setRemoved(null) }}>Пустой список</button></div></details>}
      </div>
      {tab === 'tasks' && <button className="primary-button task-add-button" onClick={() => openNew()}><IconPlus size={21} />Задание</button>}
    {removed ? <div className="toast" role="status">Задание удалено<button onClick={() => { setTasks(items => [...items, removed]); setRemoved(null) }}>Отменить</button><button aria-label="Закрыть сообщение" onClick={() => setRemoved(null)}><IconX size={17} /></button></div> : notice && <div className="toast" role="status">{notice}<IconCheck size={18} /></div>}
    </main>

    {draft && <Editor today={today} draft={draft} save={save} remove={remove} close={() => setDraft(null)} />}
    {calendarOpen && <Modal variant="calendar" title="Выбрать день" onClose={() => setCalendarOpen(false)}><div className="calendar-picker"><Calendar today={today} value={date} onChange={selected => { selectDay(selected); setCalendarOpen(false) }} /><button className="outline-button today-button" onClick={() => { selectDay(today); setCalendarOpen(false) }}>Сегодня</button></div></Modal>}
    {panel === 'beta' && <Modal title="Для бета-тестеров" onClose={() => setPanel(null)}>
      <div className="info-panel beta-panel">
        <p>Добавим 24 примера на три недели: ДЗ к реальным семинарам и лабам, а также заметки. Повторное добавление заменяет прежние тестовые записи. Твои задания остаются.</p>
        <p>Тестовых записей: {testCount}</p>
        {notebook.error && <p role="alert">{notebook.error}</p>}
        <button className="primary-button" disabled={Boolean(notebook.error)} onClick={generateExamples}>Добавить тестовые задания</button>
        <button className="text-button delete-button" disabled={Boolean(notebook.error) || !testCount} onClick={deleteExamples}>Удалить тестовые задания ({testCount})</button>
        {betaDeleted !== null && !notebook.error && <p role="status">Удалено тестовых записей: {betaDeleted}</p>}
        {notebook.error && <button className="text-button" onClick={notebook.blocked ? recoverRaw : backup}>Скачать резервную копию</button>}
      </div>
    </Modal>}
    {panel && panel !== 'beta' && <Modal title={panel === 'subjects' ? 'Предметы' : panel === 'backup' ? 'Резервная копия' : 'О приложении'} onClose={() => setPanel(null)}><div className="info-panel">{panel === 'subjects' ? <>{DEFAULT_SUBJECTS.map(s => <div className="subject-row" key={s.id}><span className={`subject-dot tone-${s.assessment}`} /><div><strong>{subjectName(s.id)}</strong><small>{{ exam: 'Экзамен', dist: 'Распределённый экзамен', credit: 'Зачёт', other: 'Без аттестации' }[s.assessment]}</small></div></div>)}</> : panel === 'backup' ? <><p>Задания и оформление сохраняются в этом браузере на этом устройстве. Скачай копию, чтобы не потерять их при очистке данных Safari.</p><button className="primary-button" onClick={backup}>Скачать резервную копию</button><p>Перенос из прежней версии и восстановление из файла подключим следующим этапом.</p></> : <><h3>ДЗ</h3><p>Задания, сроки и расписание для своей учёбы.</p><p>Версия {version}{IS_DEMO ? ' · демонстрация' : ' · для iPhone и компьютера'}.</p></>}</div></Modal>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
