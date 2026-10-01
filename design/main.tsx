import { useCallback, useEffect, useLayoutEffect, useRef, useState, type SetStateAction } from 'react'
import { createRoot } from 'react-dom/client'
import type { Lesson } from '../src/types'
import { addDays, parseISO, toISO } from '../src/lib/dates'
import { lessonsOn } from '../src/lib/week'
import { IconCalendar, IconPlus, IconCheck, IconChevronRight, IconChevronDown, IconX } from '../src/components/icons'
import { Calendar, Editor, Modal } from './components'
import { ANCHOR_MONDAY, IS_DEMO, DEFAULT_LESSONS, DEFAULT_SUBJECTS, INITIAL_TASKS, EXTRA_TASKS, subjectName, type DemoTask, type Draft } from './data'
import { version } from '../package.json'
import { useNotebook, downloadBackup, persistNotebook, importTasks, STORAGE_KEY } from './storage'
import { isHomeworkKind, isDayNote } from './homework'
import { useScheduleClock, currentDay } from './use-today'
import { generateTestTasks, isTestTask, withoutTestTasks } from './test-tasks'
import { FrameMeter } from './frame-meter'
import { Segmented } from './segmented'
import { useButtonFeedback, usePressAction } from './use-button-feedback'
import { motionDuration } from './motion'
import { useDayTravel } from './use-day-travel'
import { useGentleScroll } from './use-gentle-scroll'
import { useScrollBoundary } from './use-scroll-boundary'
import { completedTasks } from './history'
import { Navigation } from './navigation'
import { Collapse } from './collapse'
import { ScheduleDay } from './schedule-day'
import { useDaySwipe } from './use-day-swipe'
import { useInputMethod } from './use-input-method'
import { taskGroups } from './task-groups'
import { taskSummary } from './task-summary'
import { SmartInputPanel } from './smart-input-panel'
import { useCloud } from './use-cloud'
import { AccountPanel } from './account-panel'
import './style.css'
import './register-sw'

type Tab = 'tasks' | 'schedule' | 'settings'
type Theme = 'light' | 'dark' | 'black' | 'system'
type Panel = 'subjects' | 'backup' | 'about' | 'beta' | 'history' | 'account' | null
const assessmentOrder = { exam: 0, dist: 1, credit: 2, other: 3 }
const settingsSubjects = [...DEFAULT_SUBJECTS].sort((a, b) => assessmentOrder[a.assessment] - assessmentOrder[b.assessment])
const query = new URLSearchParams(location.search)
const longDate = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const weekday = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { weekday: 'long' })

function SettingIcon({ kind }: { kind: 'book' | 'download' | 'info' | 'sun' }) {
  return <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'book' ? <><path d="M12 5C9 3 5 3 2 5v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0Z" /><path d="M12 5v15" /></> : kind === 'download' ? <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /> : kind === 'info' ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
  </svg>
}

function TaskRow({ task, toggle, edit, leaving = false, groupLeaving = false, onExited }: { task: DemoTask; toggle: (id: string) => void; edit: (task: DemoTask) => void; leaving?: boolean; groupLeaving?: boolean; onExited?: (id: string) => void }) {
  const press = usePressAction()
  return <Collapse active={leaving && !groupLeaving} hold={groupLeaving} onEnd={() => onExited?.(task.id)} className="task-collapse"><div className={`task-row ${task.done ? 'completed' : ''} ${leaving ? 'task-leaving' : ''}`}>
    <button disabled={leaving} className="check-button" onClick={() => toggle(task.id)} aria-label={`${task.done ? 'Вернуть' : 'Выполнить'}: ${task.title}`} aria-pressed={task.done}><span>{task.done && <IconCheck size={17} />}</span></button>
    <button disabled={leaving} className="task-content" onClick={press(() => edit(task))}><span className="task-subject">{isDayNote(task) ? <><span>Заметка</span>{task.subjectId && <span className="note-subject">{subjectName(task.subjectId)}</span>}</> : subjectName(task.subjectId)}</span><span className="task-title">{task.title}</span><IconChevronRight size={16} /></button>
  </div></Collapse>
}

function App() {
  useInputMethod()
  const press = usePressAction()
  const now = useScheduleClock()
  const today = toISO(now)
  const previousToday = useRef(today)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [smartOpen, setSmartOpen] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<Tab>(query.get('screen') === 'tasks' ? 'tasks' : query.get('screen') === 'settings' ? 'settings' : 'schedule')
  const notebook = useNotebook(IS_DEMO ? { version: 1, theme: query.get('theme') === 'black' ? 'black' : query.get('theme') === 'dark' ? 'dark' : query.get('theme') === 'system' ? 'system' : 'light', tasks: query.get('fixture') === 'empty' ? [] : query.get('fixture') === 'stress' ? [...INITIAL_TASKS, ...EXTRA_TASKS] : INITIAL_TASKS, collapsed: [] } : null)
  const cloud = useCloud(notebook, IS_DEMO)
  const { tasks, theme, collapsed } = notebook.data
  const animationSpeed = notebook.data.animationSpeed ?? 'normal'
  useLayoutEffect(() => { document.documentElement.dataset.motion = animationSpeed }, [animationSpeed])
  const setTasks = (value: SetStateAction<DemoTask[]>) => notebook.update(current => ({ ...current, tasks: typeof value === 'function' ? value(current.tasks) : value }))
  const setTheme = (nextTheme: Theme) => {
    if (nextTheme === theme) return
    const next = { ...notebook.data, theme: nextTheme }
    // iOS сохраняет цвет системной полосы запуска. Меняем его новым запуском
    // страницы только после успешного сохранения; офлайн оставляем текущую.
    if (!IS_DEMO && !notebook.blocked && navigator.onLine &&
        (navigator as Navigator & { standalone?: boolean }).standalone) {
      try {
        persistNotebook(localStorage, next)
        const url = new URL(location.href)
        url.searchParams.set('screen', 'settings')
        location.replace(url.href)
        return
      } catch { /* Ошибку сохранения покажет useNotebook без перезагрузки. */ }
    }
    notebook.update(next)
  }
  const setCollapsed = (value: SetStateAction<string[]>) => notebook.update(current => ({ ...current, collapsed: typeof value === 'function' ? value(current.collapsed) : value }))
  const backup = () => downloadBackup(JSON.stringify(notebook.data, null, 2), `dz-${today}.json`)
  const recoverRaw = () => { try { downloadBackup(localStorage.getItem(STORAGE_KEY) || '{}', `dz-recovery-${today}.json`) } catch { setNotice('Браузер не даёт прочитать данные устройства') } }
  const [historyLimit, setHistoryLimit] = useState(20)
  const [editingHistory, setEditingHistory] = useState(false)
  const [exiting, setExiting] = useState<string[]>([])
  const finishGroup = useCallback((doneIds: string[]) => setExiting(ids => ids.filter(id => !doneIds.includes(id))), [])
  const finishExit = useCallback((id: string) => setExiting(ids => ids.filter(value => value !== id)), [])
  const [date, setDate] = useState(today)
  const dayViewport = useRef<HTMLDivElement>(null)
  const dayTrack = useRef<HTMLDivElement>(null)
  const selectDay = (next: string) => { setDate(next); mainRef.current?.scrollTo({ top: 0 }) }
  const shiftDay = (direction: -1 | 1) => { setDate(current => addDays(current, direction)); mainRef.current?.scrollTo({ top: 0 }) }
  useEffect(() => {
    const previous = previousToday.current
    setDate(selected => selected === previous ? today : selected)
    previousToday.current = today
  }, [today])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  useScrollBoundary()
  useGentleScroll()
  const [travelDay, travelling, travelPages] = useDayTravel(dayViewport, dayTrack, date, selectDay, tab === 'schedule' && !calendarOpen && !draft && !panel)
  useDaySwipe(dayViewport, dayTrack, date, tab === 'schedule' && !calendarOpen && !draft && !panel && !travelling, shiftDay)
  useButtonFeedback()
  const [betaDeleted, setBetaDeleted] = useState<number | null>(null)
  const [undo, setUndo] = useState<{ type: 'delete' | 'complete'; task: DemoTask } | null>(null)
  const [addedBatch, setAddedBatch] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const toastRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const toast = toastRef.current
    const scroll = mainRef.current
    if (!toast || !scroll) return
    const main = scroll.closest<HTMLElement>('.app-main')!
    const actions = main.querySelector<HTMLElement>('.entry-actions-buttons')
    // На узком экране отмена располагается над общим рядом добавления.
    const place = () => {
      const bounds = toast.getBoundingClientRect()
      const mainBounds = main.getBoundingClientRect()
      const bottom = mainBounds.bottom
      const anchor = actions?.querySelector('button')?.getBoundingClientRect()
      if ((!undo || undo.type === 'complete') && anchor) {
        toast.style.setProperty('--notice-left', `${anchor.left - mainBounds.left}px`)
        toast.style.setProperty('--notice-width', `${anchor.width}px`)
        toast.style.setProperty('--toast-bottom', `${undo?.type === 'complete' && tab === 'tasks' ? bottom - anchor.bottom : bottom - anchor.top + 10}px`)
        return
      }
      const row = actions?.getBoundingClientRect()
      const overlaps = row && row.left < bounds.right && row.right > bounds.left &&
        row.bottom > bottom - 16 - bounds.height && row.top < bottom - 16
      toast.style.setProperty('--toast-bottom', `${overlaps ? bottom - row.top + 12 : 16}px`)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(main)
    observer.observe(toast)
    if (actions) observer.observe(actions)
    return () => observer.disconnect()
  }, [undo, notice, tab, date])
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const root = document.documentElement
    // Ранний фон index.html сменяется той же палитрой, без перезагрузки standalone.
    // Системная область WebKit отслеживает фон страницы отдельно от палитры.
    // Передаём ему также явный background-color, без перезагрузки.
    const apply = () => {
      const resolved = theme === 'system' ? media.matches ? 'dark' : 'light' : theme
      const changed = root.dataset.theme !== resolved
      if (changed) root.dataset.themeTransition = 'true'
      // Фиксируем прежний цвет перед началом перехода, в том числе при первом клике.
      getComputedStyle(root).getPropertyValue('--bg')
      root.dataset.theme = resolved
      const background = { light: '#fdfcfb', dark: '#17191d', black: '#000000' }[resolved]
      root.style.backgroundColor = background
      document.body.style.backgroundColor = background
      document.getElementById('system-top')?.style.setProperty('background-color', background)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
    }
    apply(); media.addEventListener('change', apply)
    window.addEventListener('pageshow', apply)
    return () => { media.removeEventListener('change', apply); window.removeEventListener('pageshow', apply) }
  }, [theme])
  useEffect(() => { if (!notice || draft || panel) return; const timer = setTimeout(() => { setNotice(''); setAddedBatch([]) }, addedBatch.length ? 15000 : 2500); return () => clearTimeout(timer) }, [notice, draft, panel, addedBatch.length])
  useEffect(() => { if (!undo || draft || panel) return; const timer = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(timer) }, [undo, draft, panel])
  const toggle = (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task || exiting.includes(id)) return
    setTasks(items => items.map(t => t.id === id ? { ...t, done: !t.done } : t))
    setAddedBatch([]); setNotice('')
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
    setUndo(null); setAddedBatch([]); setNotice(value.id ? 'Изменения сохранены' : isDayNote(value) ? 'Заметка добавлена' : 'Задание добавлено')
  }
  const remove = (id: string) => { const task = tasks.find(t => t.id === id); setUndo(task ? { type: 'delete', task } : null); setNotice(''); setTasks(items => items.filter(t => t.id !== id)) }
  const testCount = tasks.filter(isTestTask).length
  const generateExamples = () => {
    const days = Array.from({ length: 21 }, (_, i) => {
      const date = addDays(today, i)
      return { date, lessons: lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY) }
    })
    const generated = generateTestTasks(days, crypto.randomUUID())
    setTasks(items => [...withoutTestTasks(items), ...generated])
    setUndo(null); setAddedBatch([]); setBetaDeleted(null)
  }
  const deleteExamples = () => {
    setBetaDeleted(testCount)
    setTasks(withoutTestTasks)
    setUndo(null); setAddedBatch([])
  }
  const visible = tasks.filter(t => !t.done || exiting.includes(t.id))
  const grouped = taskGroups(visible, today)
  const done = completedTasks(tasks)
  const row = (task: DemoTask, groupLeaving = false) => <TaskRow key={task.id} task={task} toggle={toggle} edit={setDraft} leaving={tab === 'tasks' && exiting.includes(task.id)} groupLeaving={groupLeaving} onExited={finishExit} />
  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
    const main = mainRef.current?.closest('.app-main')
    const duration = motionDuration(true)
    if (!main || !duration) return
    // Нижние действия и навигация остаются неподвижными.
    const animations = [...main.querySelectorAll<HTMLElement>(':scope > .screen-header, :scope > .app-scroll, :scope > .day-viewport')].map(element => element.animate([
      { opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' },
    ], { duration, easing: 'cubic-bezier(.2, .7, .2, 1)' }))
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const cancel = () => animations.forEach(animation => animation.cancel())
    reduced.addEventListener('change', cancel)
    return () => { cancel(); reduced.removeEventListener('change', cancel) }
  }, [tab])
  const changeTab = (next: Tab) => {
    if (next === 'schedule' && tab !== 'schedule') { setDate(currentDay()) }
    setExiting([]); setTab(next); mainRef.current?.scrollTo({ top: 0 })
  }

  const storageWarning = notebook.error && <div className="storage-warning" role="alert"><p>{notebook.error}</p><button onClick={notebook.blocked ? recoverRaw : backup}>Скачать резервную копию</button></div>
  const highlightURL = (kind: 'lesson' | 'break' | 'exit') => {
    const url = new URL(location.href)
    url.search = kind === 'exit' ? '?screen=settings' : new URLSearchParams({ demo: '1', highlight: kind, theme, screen: 'schedule' }).toString()
    return url.href
  }
  const demoTools = IS_DEMO && <details className="preview-tools"><summary>Демонстрационный макет</summary><p>Изменения хранятся до перезагрузки. Сегодня в примерах — 21 сентября 2026.</p><div><button onClick={() => { setTasks(INITIAL_TASKS); setCollapsed([]); setUndo(null); setExiting([]) }}>Исходный список</button><button onClick={() => { setTasks([...INITIAL_TASKS, ...EXTRA_TASKS]); setCollapsed([]); setExiting([]); setUndo(null) }}>Длинные записи и просрочка</button><button onClick={() => { setTasks([]); setUndo(null) }}>Пустой список</button></div></details>

  return <div className="app-shell">
    <Navigation tab={tab} changeTab={changeTab} />
    <main className={`app-main screen-${tab}`} data-swipe-days={tab === 'schedule' ? '' : undefined}>
      {IS_DEMO && query.has('highlight') && <div className="highlight-preview"><p>Просмотр подсветки · 21 сентября, {query.get('highlight') === 'break' ? '13:35' : '14:30'}. Твои данные не меняются.</p><div><a href={highlightURL('lesson')}>Пара</a><a href={highlightURL('break')}>Перерыв</a><a href={highlightURL('exit')}>Выйти из просмотра</a></div></div>}
      {tab === 'schedule' ? <div className="day-viewport" ref={dayViewport}>
        <div className="day-track" ref={dayTrack}>{(travelPages ?? [-1, 0, 1].map(offset => ({ date: addDays(date, offset), position: offset, preview: offset !== 0 }))).map(page => <ScheduleDay key={page.position} position={page.position} date={page.date} today={today} minute={now.getHours() * 60 + now.getMinutes()} tasks={tasks} preview={page.preview} scrollRef={!page.preview ? mainRef : undefined} openCalendar={() => setCalendarOpen(true)} selectDay={travelDay} shiftDay={shiftDay} openLesson={openLesson} row={row} banner={!page.preview ? storageWarning : undefined}>{!page.preview ? demoTools : undefined}</ScheduleDay>)}</div>
      </div> : <>
      <div className="screen-header">
      <header className="page-header"><h1>{tab === 'tasks' ? 'Задачи' : 'Настройки'}</h1>{tab === 'tasks' && <button className="outline-button history-button" onClick={press(openHistory)}><IconCheck size={18} />История</button>}</header>
      </div>
      <div ref={mainRef} className="app-scroll" data-scroll-region>
      {storageWarning}
      {tab === 'tasks' && <div className="task-list">
        {!visible.length && <div className="tasks-empty"><span className="empty-check"><IconCheck size={38} /></span><h2>{tasks.length ? 'Заданий больше нет' : 'Пока нет заданий'}</h2></div>}
        {grouped.groups.map(group => {
          const leaving = group.tasks.every(t => exiting.includes(t.id))
          const days = [...new Set(group.tasks.map(t => t.due))]
          return <Collapse key={group.id} className="task-period-collapse" active={leaving} onEnd={() => finishGroup(group.tasks.map(t => t.id))}>
            <section className={`task-period ${group.id === 'overdue' ? 'overdue' : ''}`}>
              <h2 className="task-period-title">{group.title}</h2>
              {group.id === 'current' && <p className="task-period-range">{longDate(grouped.start)} — {longDate(grouped.end)}</p>}
              {days.map(day => {
                const entries = group.tasks.filter(t => t.due === day)
                const dayLeaving = entries.every(t => exiting.includes(t.id))
                const folded = collapsed.includes(day)
                return <Collapse key={day} className="day-collapse" active={dayLeaving && !leaving} hold={leaving} onEnd={() => finishGroup(entries.map(t => t.id))}>
                  <section className="day-section">
                    <button className="day-heading" onClick={() => setCollapsed(list => list.includes(day) ? list.filter(d => d !== day) : [...list, day])} aria-expanded={!folded} aria-controls={`day-tasks-${day}`}>
                      <span><span>{longDate(day)}{parseISO(day).getFullYear() !== parseISO(today).getFullYear() && <small> {parseISO(day).getFullYear()}</small>}</span><span className={`day-summary ${folded ? 'visible' : ''}`} aria-hidden={!folded}><span>{taskSummary(entries)}</span></span></span><span className="day-weekday">{weekday(day)}<IconChevronDown size={14} className={folded ? 'rotated' : ''} /></span>
                    </button>
                    <div id={`day-tasks-${day}`} className={`day-tasks ${folded ? 'folded' : ''}`} inert={folded} aria-hidden={folded}><div>{entries.map(t => row(t, dayLeaving || leaving))}</div></div>
                  </section>
                </Collapse>
              })}
            </section>
          </Collapse>
        })}

      </div>}

      {tab === 'settings' && <div className="settings-list">
        <button className="setting-row" onClick={press(() => setPanel('account'))}><SettingIcon kind="info" /><span><strong>Аккаунт и синхронизация</strong><small>{IS_DEMO ? 'В демо отключены' : cloud.session ? cloud.error || (notebook.data.sync?.conflicts.length ? 'Нужно выбрать версию заданий' : cloud.status || cloud.session.user.username) : 'Сохранение на сервере и другое устройство'}</small></span><IconChevronRight size={18} /></button>
        <section className="appearance"><h2>Оформление</h2><Segmented label="Оформление" value={theme} columns={2} onChange={setTheme} options={[{ id: 'light', label: 'Светлая' }, { id: 'dark', label: 'Тёмная' }, { id: 'black', label: 'Чёрная' }, { id: 'system', label: 'Системная' }]} /></section>
        <section className="appearance animation-settings"><h2>Анимации</h2><Segmented label="Скорость анимаций" value={animationSpeed} onChange={animationSpeed => notebook.update(current => ({ ...current, animationSpeed }))} options={[{ id: 'fast', label: 'Быстро' }, { id: 'normal', label: 'Обычно' }, { id: 'smooth', label: 'Плавно' }]} /><p className="binding-hint">Если в системе включено уменьшение движения, анимации отключены.</p></section>
        <button className="setting-row" onClick={press(() => setPanel('subjects'))}><SettingIcon kind="book" /><span><strong>Предметы</strong><small>Список предметов и аттестации</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={press(() => changeTab('schedule'))}><IconCalendar size={27} /><span><strong>Расписание</strong><small>Учебные недели и время занятий</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={press(() => setPanel('backup'))}><SettingIcon kind="download" /><span><strong>Резервная копия</strong><small>Скачать данные в файл</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={press(() => setPanel('beta'))}><SettingIcon kind="book" /><span><strong>Для бета-тестеров</strong><small>Примеры, подсветка и плавность</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={press(() => setPanel('about'))}><SettingIcon kind="info" /><span><strong>О приложении</strong><small>Версия {version}</small></span><IconChevronRight size={18} /></button>
      </div>}
      {demoTools}
      </div>
      </>}
      {tab !== 'settings' && <div className="entry-actions"><div className="entry-actions-buttons">
        <button className={`outline-button entry-add-button note-add-button ${tab === 'tasks' ? 'note-placeholder' : ''}`} aria-hidden={tab === 'tasks' || undefined} tabIndex={tab === 'tasks' ? -1 : undefined} onClick={press(() => setDraft({ entryType: 'note', subjectId: '', title: '', due: date }))}><IconPlus size={21} />Заметка</button>
        <button className="primary-button entry-add-button task-add-button" onClick={press(() => openNew())}><IconPlus size={21} />Задание</button>
        {import.meta.env.VITE_DZ_SYNC_ONLY !== '1' && (cloud.enabled || import.meta.env.DEV) && <button className="outline-button entry-microphone" aria-label="Надиктовать задания" onClick={press(() => setSmartOpen(true))}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg></button>}
      </div></div>}
      {undo?.type === 'complete' && tab !== 'settings' ? <div ref={toastRef} className="toast toast-notice toast-complete" role="status"><button onClick={undoLast} aria-label="Отменить выполнение"><span>{notebook.error ? 'Не сохранено' : 'Выполнено'}</span><strong>Отменить</strong></button></div> : undo ? <div ref={toastRef} className="toast" role="status"><span className="toast-message">{notebook.error ? 'Не сохранено' : undo.type === 'delete' ? 'Задание удалено' : 'Выполнено'}</span><button onClick={undoLast}>Отменить</button><button className="toast-close" aria-label="Закрыть сообщение" onClick={press(() => setUndo(null))}><IconX size={17} /></button></div> : notice && !notebook.error && <div ref={toastRef} className={`toast toast-notice ${addedBatch.length ? 'toast-batch' : ''}`} role="status"><span className="toast-message">{notice}</span>{addedBatch.length > 0 && <button onClick={() => {
        try { notebook.commit(current => ({ ...current, tasks: current.tasks.filter(t => !addedBatch.includes(t.id)) })); setAddedBatch([]); setNotice('Добавление отменено') }
        catch { /* Ошибка сохранения остаётся в предупреждении, кнопку не убираем. */ }
      }}>Отменить добавление</button>}</div>}
    </main>

    {draft && <Editor today={today} draft={draft} save={save} remove={remove} close={closeEditor} />}
    {calendarOpen && <Modal variant="calendar" title="Выбрать день" onClose={() => setCalendarOpen(false)}>{dismiss => <div className="calendar-picker"><Calendar today={today} value={date} onChange={selected => { selectDay(selected); dismiss() }} showMonthShortcut /></div>}</Modal>}
    {panel === 'history' && <Modal title="Выполненные задания" onClose={() => setPanel(null)}>{dismiss => <div className="history-list">{!done.length ? <p className="history-empty">Здесь появятся выполненные задания.</p> : <><p className="history-caption"><span>По дате задания</span><span>Всего: {done.length}</span></p>{done.slice(0, historyLimit).map(task => <div key={task.id}><p className="history-date">{parseISO(task.due).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p><TaskRow task={task} toggle={toggle} edit={task => dismiss(() => editHistory(task))} /></div>)}{done.length > historyLimit && <button className="outline-button history-more" onClick={() => setHistoryLimit(n => n + 20)}>Показать ещё</button>}</>}</div>}</Modal>}
    {(cloud.enabled || import.meta.env.DEV) && smartOpen && <Modal title="Быстрое добавление" onClose={() => setSmartOpen(false)}>{dismiss => <>
      <label className="auto-add-option"><input type="checkbox" checked={notebook.data.autoAdd ?? false} onChange={e => notebook.update(current => ({ ...current, autoAdd: e.target.checked }))} /> Добавлять однозначные задания автоматически</label>
      <SmartInputPanel agent={cloud.enabled ? cloud.agent : undefined} autoAdd={notebook.data.autoAdd} save={drafts => {
      if (notebook.blocked) throw new Error('Данные заблокированы')
      const added = drafts.map(d => ({ ...d, id: crypto.randomUUID(), done: false }))
      notebook.commit(current => ({ ...current, tasks: [...current.tasks, ...added] }))
      setUndo(null); setAddedBatch(added.map(t => t.id)); dismiss(() => { setSmartOpen(false); setNotice(`Добавлено: ${drafts.length}`) })
    }} /></>}</Modal>}
    {panel === 'account' && <Modal title="Аккаунт и синхронизация" onClose={() => setPanel(null)}><div className="info-panel"><AccountPanel cloud={cloud} state={notebook.data.sync} demo={IS_DEMO} /></div></Modal>}
    {panel === 'beta' && <Modal title="Для бета-тестеров" onClose={() => setPanel(null)}>
      <div className="info-panel beta-panel">
        {import.meta.env.DEV && <button className="primary-button" onClick={() => { setPanel(null); setSmartOpen(true) }}>Текстом или голосом · локальный тест</button>}
        <a className="outline-button" href={highlightURL('lesson')}>Проверить подсветку</a>
        <FrameMeter />
        <p>Добавим 24 примера на три недели: ДЗ к реальным семинарам и лабам, а также заметки. Повторное добавление заменяет прежние тестовые записи. Твои задания остаются.</p>
        <p>Тестовых записей: {testCount}</p>
        {notebook.error && <p role="alert">{notebook.error}</p>}
        <button className="primary-button" disabled={Boolean(notebook.error)} onClick={generateExamples}>Добавить тестовые задания</button>
        <button className="text-button delete-button" disabled={Boolean(notebook.error) || !testCount} onClick={deleteExamples}>Удалить тестовые задания ({testCount})</button>
        {betaDeleted !== null && !notebook.error && <p role="status">Удалено тестовых записей: {betaDeleted}</p>}
        {notebook.error && <button className="text-button" onClick={notebook.blocked ? recoverRaw : backup}>Скачать резервную копию</button>}
      </div>
    </Modal>}
    {panel && panel !== 'beta' && panel !== 'history' && panel !== 'account' && <Modal title={panel === 'subjects' ? 'Предметы' : panel === 'backup' ? 'Резервная копия' : 'О приложении'} onClose={() => setPanel(null)}><div className="info-panel">
      {panel === 'subjects' ? <>{settingsSubjects.map(s => <div className="subject-row" key={s.id}><span className={`subject-dot tone-${s.assessment}`} /><div><strong>{subjectName(s.id)}</strong><small>{{ exam: 'Экзамен', dist: 'Распределённый экзамен', credit: 'Зачёт', other: 'Без аттестации' }[s.assessment]}</small></div></div>)}</> : panel === 'backup' ? <>
        <p>Скачай копию, чтобы восстановить задания при очистке данных устройства. При входе в аккаунт задания дополнительно сохраняются на сервере.</p>
        <button className="primary-button" onClick={backup}>Скачать копию данных</button>
        <label className="backup-import">Восстановить задания из JSON<input type="file" accept="application/json,.json" disabled={notebook.blocked} onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
          try {
            if (file.size > 5_000_000) throw new Error('Файл слишком большой: до 5 МБ.')
            const raw = await file.text()
            if (!IS_DEMO) localStorage.setItem('dz-next:before-import:v1', JSON.stringify(notebook.data))
            notebook.commit(current => importTasks(current, raw))
            setAddedBatch([]); setNotice('Задания из файла добавлены')
          } catch (e) { setNotice(e instanceof Error ? e.message : 'Не удалось восстановить задания.') }
        }} /></label>
        <p>Восстановление добавляет записи к существующим. Одинаковые записи не дублируются; отличающиеся версии сохраняются отдельно. Привязка аккаунта из файла не переносится.</p>
        {notice && <p role="status">{notice}</p>}
      </> : <><h3>ДЗ</h3><p>Задания, сроки и расписание для своей учёбы.</p><p>Версия {version}<br />{IS_DEMO ? 'Демонстрация' : 'Для iPhone и компьютера'}</p></>}
    </div></Modal>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
