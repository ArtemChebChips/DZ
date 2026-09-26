import { useCallback, useEffect, useLayoutEffect, useRef, useState, type SetStateAction } from 'react'
import { createRoot } from 'react-dom/client'
import type { Lesson } from '../src/types'
import { addDays, parseISO } from '../src/lib/dates'
import { lessonsOn, parityOf } from '../src/lib/week'
import { IconCalendar, IconPlus, IconCheck, IconChevronRight, IconChevronDown, IconChevronLeft, IconChevronRight as IconDayNext, IconX } from '../src/components/icons'
import { Calendar, Editor, Modal } from './components'
import { ANCHOR_MONDAY, IS_DEMO, DEFAULT_LESSONS, DEFAULT_SUBJECTS, INITIAL_TASKS, EXTRA_TASKS, subjectName, kindName, type DemoTask, type Draft } from './data'
import { version } from '../package.json'
import { useNotebook, downloadBackup, STORAGE_KEY } from './storage'
import { taskLesson, isHomeworkKind, isDayNote } from './homework'
import { useToday, currentDay } from './use-today'
import { generateTestTasks, isTestTask, withoutTestTasks } from './test-tasks'
import { useScrollBoundary } from './use-scroll-boundary'
import { completedTasks } from './history'
import { Navigation } from './navigation'
import { Collapse } from './collapse'
import './style.css'
import './register-sw'

type Tab = 'tasks' | 'schedule' | 'settings'
type Theme = 'light' | 'dark' | 'system'
type Panel = 'subjects' | 'backup' | 'about' | 'beta' | 'history' | null
const assessmentOrder = { exam: 0, dist: 1, credit: 2, other: 3 }
const settingsSubjects = [...DEFAULT_SUBJECTS].sort((a, b) => assessmentOrder[a.assessment] - assessmentOrder[b.assessment])
const query = new URLSearchParams(location.search)
const longDate = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const weekday = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { weekday: 'long' })
const relativeDate = (date: string, today: string) => date < today ? 'Просрочено' : date === today ? 'Сегодня' : date === addDays(today, 1) ? 'Завтра' : 'Позже'

function SettingIcon({ kind }: { kind: 'book' | 'download' | 'info' | 'sun' }) {
  return <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'book' ? <><path d="M12 5C9 3 5 3 2 5v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0Z" /><path d="M12 5v15" /></> : kind === 'download' ? <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /> : kind === 'info' ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
  </svg>
}

function TaskRow({ task, toggle, edit, leaving = false, groupLeaving = false, onExited }: { task: DemoTask; toggle: (id: string) => void; edit: (task: DemoTask) => void; leaving?: boolean; groupLeaving?: boolean; onExited?: (id: string) => void }) {
  return <Collapse active={leaving && !groupLeaving} hold={groupLeaving} onEnd={() => onExited?.(task.id)} className="task-collapse"><div className={`task-row ${task.done ? 'completed' : ''} ${leaving ? 'task-leaving' : ''}`}>
    <button disabled={leaving} className="check-button" onClick={() => toggle(task.id)} aria-label={`${task.done ? 'Вернуть' : 'Выполнить'}: ${task.title}`} aria-pressed={task.done}><span>{task.done && <IconCheck size={17} />}</span></button>
    <button disabled={leaving} className="task-content" onClick={() => edit(task)}><span className="task-subject">{isDayNote(task) ? `Заметка${task.subjectId ? ' · ' + subjectName(task.subjectId) : ''}` : subjectName(task.subjectId)}</span><span className="task-title">{task.title}</span><IconChevronRight size={16} /></button>
  </div></Collapse>
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
  const [historyLimit, setHistoryLimit] = useState(20)
  const [editingHistory, setEditingHistory] = useState(false)
  const [exiting, setExiting] = useState<string[]>([])
  const finishGroup = useCallback((doneIds: string[]) => setExiting(ids => ids.filter(id => !doneIds.includes(id))), [])
  const finishExit = useCallback((id: string) => setExiting(ids => ids.filter(value => value !== id)), [])
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
  const [undo, setUndo] = useState<{ type: 'delete' | 'complete'; task: DemoTask } | null>(null)
  const [notice, setNotice] = useState('')
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const root = document.documentElement
      root.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme
      const background = getComputedStyle(root).getPropertyValue('--bg').trim()
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
    }
    apply(); media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 2500); return () => clearTimeout(timer) }, [notice])
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(timer) }, [undo])
  const toggle = (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task || exiting.includes(id)) return
    setTasks(items => items.map(t => t.id === id ? { ...t, done: !t.done } : t))
    setNotice('')
    setUndo(task.done ? null : { type: 'complete', task })
    if (!task.done && tab === 'tasks' && panel !== 'history' && !matchMedia('(prefers-reduced-motion: reduce)').matches) setExiting(ids => [...ids, id])
  }
  const undoLast = () => {
    if (!undo) return
    setTasks(items => undo.type === 'delete' ? (items.some(t => t.id === undo.task.id) ? items : [...items, undo.task]) : items.map(t => t.id === undo.task.id ? { ...t, done: false } : t))
    finishExit(undo.task.id); setUndo(null)
  }
  const closeEditor = () => { setDraft(null); if (editingHistory) setPanel('history'); setEditingHistory(false) }
  const openHistory = () => { setExiting([]); setHistoryLimit(20); setPanel('history') }
  const editHistory = (task: DemoTask) => { setPanel(null); setEditingHistory(true); setDraft(task) }
  const openNew = (lesson?: Lesson) => setDraft({ entryType: 'homework', subjectId: lesson?.subjectId || '', title: '', due: tab === 'schedule' ? date : today, kind: lesson?.kind, lessonId: lesson?.id, locked: Boolean(lesson) })
  const openLesson = (lesson: Lesson) => isHomeworkKind(lesson.kind) ? openNew(lesson) : setDraft({ entryType: 'note', subjectId: lesson.subjectId, title: '', due: date })
  const save = (value: Draft) => {
    const { locked: _locked, ...record } = value
    setTasks(items => record.id ? items.map(t => t.id === record.id ? { ...t, ...record } : t) : [...items, { ...record, id: crypto.randomUUID(), done: false }])
    closeEditor(); setUndo(null); setNotice(value.id ? 'Изменения сохранены' : isDayNote(value) ? 'Заметка добавлена' : 'Задание добавлено')
  }
  const remove = (id: string) => { const task = tasks.find(t => t.id === id); setUndo(task ? { type: 'delete', task } : null); setNotice(''); setTasks(items => items.filter(t => t.id !== id)); closeEditor() }
  const testCount = tasks.filter(isTestTask).length
  const generateExamples = () => {
    const days = Array.from({ length: 21 }, (_, i) => {
      const date = addDays(today, i)
      return { date, lessons: lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY) }
    })
    const generated = generateTestTasks(days, crypto.randomUUID())
    setTasks(items => [...withoutTestTasks(items), ...generated])
    setUndo(null); setBetaDeleted(null)
  }
  const deleteExamples = () => {
    setBetaDeleted(testCount)
    setTasks(withoutTestTasks)
    setUndo(null)
  }
  const visible = tasks.filter(t => !t.done || exiting.includes(t.id))
  const days = [...new Set(visible.map(t => t.due))].sort()
  const done = completedTasks(tasks)
  const lessons = lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY)
  const ownTasks = tasks.filter(t => t.due === date)
  const assigned = new Set<string>()
  const row = (task: DemoTask, groupLeaving = false) => <TaskRow key={task.id} task={task} toggle={toggle} edit={setDraft} leaving={tab === 'tasks' && exiting.includes(task.id)} groupLeaving={groupLeaving} onExited={finishExit} />
  useLayoutEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [tab])
  const changeTab = (next: Tab) => {
    if (next === 'schedule' && tab !== 'schedule') setDate(currentDay())
    setExiting([]); setTab(next); mainRef.current?.scrollTo({ top: 0 })
  }

  return <div className="app-shell">
    <Navigation tab={tab} changeTab={changeTab} />
    <main className={`app-main screen-${tab}`}>
      <div className="screen-header">
      {tab !== 'schedule' && <header className="page-header"><h1>{tab === 'tasks' ? 'Задачи' : 'Настройки'}</h1>{tab === 'tasks' && <button className="outline-button history-button" onClick={openHistory}><IconCheck size={18} />История</button>}</header>}
      {tab === 'schedule' && <header className="agenda-heading">
        <h1 className="agenda-day">{date === today ? 'Сегодня' : weekday(date)},</h1>
        <div className="agenda-date-row">
          <time className="agenda-date" dateTime={date}>{longDate(date)}</time>
          <div className="agenda-controls">
            {date !== today && <button className="outline-button today-button" onClick={() => selectDay(today)}>Сегодня</button>}
            <button className="outline-button calendar-toggle" aria-label="Календарь" onClick={() => setCalendarOpen(true)}><IconCalendar size={22} /></button>
          </div>
        </div>
        <div className="agenda-meta"><p>{parityOf(date, ANCHOR_MONDAY) === 'num' ? 'Числитель' : 'Знаменатель'}</p>
          <div className="day-stepper"><button className="icon-button" aria-label="Предыдущий день" onClick={() => shiftDay(-1)}><IconChevronLeft size={18} /></button><button className="icon-button" aria-label="Следующий день" onClick={() => shiftDay(1)}><IconDayNext size={18} /></button></div>
        </div>
      </header>}
      </div>
      <div ref={mainRef} className="app-scroll" data-scroll-region data-swipe-days={tab === 'schedule' ? '' : undefined}>
      {notebook.error && <div className="storage-warning" role="alert"><p>{notebook.error}</p><button onClick={notebook.blocked ? recoverRaw : backup}>Скачать резервную копию</button></div>}
      {tab === 'tasks' && <div className="task-list">
        {!visible.length && <div className="tasks-empty"><span className="empty-check"><IconCheck size={38} /></span><h2>{tasks.length ? 'Заданий больше нет' : 'Пока нет заданий'}</h2></div>}
        {days.map(day => {
          const entries = visible.filter(t => t.due === day)
          const groupLeaving = entries.every(t => exiting.includes(t.id))
          return <Collapse key={day} className="day-collapse" active={groupLeaving} onEnd={() => finishGroup(entries.map(t => t.id))}><section className={`day-section ${day < today ? 'overdue' : ''}`}>

          <button className="day-heading" onClick={() => setCollapsed(list => list.includes(day) ? list.filter(d => d !== day) : [...list, day])} aria-expanded={!collapsed.includes(day)}>
            <span><span className="relative-date">{relativeDate(day, today)}</span><h2>{longDate(day)}{parseISO(day).getFullYear() !== parseISO(today).getFullYear() && <small> {parseISO(day).getFullYear()}</small>}</h2></span><span className="day-weekday">{weekday(day)}<IconChevronDown size={14} className={collapsed.includes(day) ? 'rotated' : ''} /></span>
          </button>
          {!collapsed.includes(day) && entries.map(t => row(t, groupLeaving))}
        </section></Collapse>})}

      </div>}
      {tab === 'schedule' && <div key={date} className={`schedule-layout day-enter day-direction-${dayDirection}`}><section className="agenda">
        {!lessons.length && <div className="empty-state"><IconCalendar size={28} /><h2>День без пар</h2><p>Задания на этот день можно добавить отдельно.</p></div>}
        {lessons.map(lesson => {
          const attached = ownTasks.filter(t => taskLesson(t, lessons)?.id === lesson.id)
          attached.forEach(t => assigned.add(t.id))
          return <article className="lesson" key={lesson.id}><button className="lesson-open" aria-label={`Добавить ${isHomeworkKind(lesson.kind) ? 'задание' : 'заметку'}: ${subjectName(lesson.subjectId)}, ${kindName[lesson.kind]}, ${lesson.start}`} onClick={() => openLesson(lesson)} /><div className="lesson-time"><time>{lesson.start}</time><span>–</span><time>{lesson.end}</time></div><div className="lesson-body"><div className="lesson-title"><h3>{subjectName(lesson.subjectId)}</h3></div><p>{kindName[lesson.kind]}{lesson.room && ` · ${/^каф\./i.test(lesson.room) ? lesson.room : 'Каб. ' + lesson.room}`}</p>{lesson.teacher && <p className="lesson-detail">{lesson.teacher}</p>}{attached.map(t => row(t))}</div></article>
        })}
        {ownTasks.some(t => !isDayNote(t) && !assigned.has(t.id)) && <section className="day-extra"><h3>Без привязки к паре</h3><p className="binding-hint">Открой задание, чтобы выбрать занятие.</p>{ownTasks.filter(t => !isDayNote(t) && !assigned.has(t.id)).map(t => row(t))}</section>}
        {ownTasks.some(isDayNote) && <section className="day-extra"><h3>Заметки на день</h3>{ownTasks.filter(isDayNote).map(t => row(t))}</section>}
        <div className="agenda-actions"><button className="outline-button" onClick={() => setDraft({ entryType: 'note', subjectId: '', title: '', due: date })}><IconPlus size={19} />Заметка</button><button className="primary-button" onClick={() => openNew()}>Добавить задание</button></div>
      </section></div>}
      {tab === 'settings' && <div className="settings-list">
        <section className="appearance"><h2>Оформление</h2><div className="theme-options" aria-label="Оформление">{([{ id: 'light', label: 'Светлая' }, { id: 'dark', label: 'Тёмная' }, { id: 'system', label: 'Системная' }] as const).map(t => <button key={t.id} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>{t.label}</button>)}</div></section>
        <button className="setting-row" onClick={() => setPanel('subjects')}><SettingIcon kind="book" /><span><strong>Предметы</strong><small>Список предметов и аттестации</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => changeTab('schedule')}><IconCalendar size={27} /><span><strong>Расписание</strong><small>Учебные недели и время занятий</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => setPanel('backup')}><SettingIcon kind="download" /><span><strong>Резервная копия</strong><small>Скачать данные в файл</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => setPanel('beta')}><SettingIcon kind="book" /><span><strong>Для бета-тестеров</strong><small>Примеры заданий на три недели</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => setPanel('about')}><SettingIcon kind="info" /><span><strong>О приложении</strong><small>Версия {version}</small></span><IconChevronRight size={18} /></button>
      </div>}
      {IS_DEMO && <details className="preview-tools"><summary>Демонстрационный макет</summary><p>Изменения хранятся до перезагрузки. Сегодня в примерах — 21 сентября 2026.</p><div><button onClick={() => { setTasks(INITIAL_TASKS); setCollapsed([]); setUndo(null); setExiting([]) }}>Исходный список</button><button onClick={() => { setTasks([...INITIAL_TASKS, ...EXTRA_TASKS]); setCollapsed([]); setExiting([]); setUndo(null) }}>Длинные записи и просрочка</button><button onClick={() => { setTasks([]); setUndo(null) }}>Пустой список</button></div></details>}
      </div>
      {tab === 'tasks' && <button className="primary-button task-add-button" onClick={() => openNew()}><IconPlus size={21} />Задание</button>}
      {undo ? <div className="toast" role="status">{notebook.error ? 'Не сохранено' : undo.type === 'delete' ? 'Задание удалено' : 'Выполнено'}<button onClick={undoLast}>Отменить</button><button aria-label="Закрыть сообщение" onClick={() => setUndo(null)}><IconX size={17} /></button></div> : notice && !notebook.error && <div className="toast" role="status">{notice}<IconCheck size={18} /></div>}
    </main>

    {draft && <Editor today={today} draft={draft} save={save} remove={remove} close={closeEditor} />}
    {calendarOpen && <Modal variant="calendar" title="Выбрать день" onClose={() => setCalendarOpen(false)}><div className="calendar-picker"><Calendar today={today} value={date} onChange={selected => { selectDay(selected); setCalendarOpen(false) }} /><button className="outline-button today-button" onClick={() => { selectDay(today); setCalendarOpen(false) }}>Сегодня</button></div></Modal>}
    {panel === 'history' && <Modal title="Выполненные задания" onClose={() => setPanel(null)}><div className="history-list">{!done.length ? <p className="history-empty">Здесь появятся выполненные задания.</p> : <><p className="history-caption">По дате задания · {done.length}</p>{done.slice(0, historyLimit).map(task => <div key={task.id}><p className="history-date">{parseISO(task.due).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p><TaskRow task={task} toggle={toggle} edit={editHistory} /></div>)}{done.length > historyLimit && <button className="outline-button history-more" onClick={() => setHistoryLimit(n => n + 20)}>Показать ещё</button>}</>}</div></Modal>}
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
    {panel && panel !== 'beta' && panel !== 'history' && <Modal title={panel === 'subjects' ? 'Предметы' : panel === 'backup' ? 'Резервная копия' : 'О приложении'} onClose={() => setPanel(null)}><div className="info-panel">{panel === 'subjects' ? <>{settingsSubjects.map(s => <div className="subject-row" key={s.id}><span className={`subject-dot tone-${s.assessment}`} /><div><strong>{subjectName(s.id)}</strong><small>{{ exam: 'Экзамен', dist: 'Распределённый экзамен', credit: 'Зачёт', other: 'Без аттестации' }[s.assessment]}</small></div></div>)}</> : panel === 'backup' ? <><p>Задания и оформление сохраняются в этом браузере на этом устройстве. Скачай копию, чтобы не потерять их при очистке данных Safari.</p><button className="primary-button" onClick={backup}>Скачать копию данных</button><p>Кнопка создаёт файл с текущими заданиями и настройками. Облачного сохранения и восстановления из файла в приложении пока нет.</p></> : <><h3>ДЗ</h3><p>Задания, сроки и расписание для своей учёбы.</p><p>Версия {version}{IS_DEMO ? ' · демонстрация' : ' · для iPhone и компьютера'}.</p></>}</div></Modal>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
