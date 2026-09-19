import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Lesson } from '../src/types'
import { addDays, parseISO, WEEKDAYS_SHORT } from '../src/lib/dates'
import { lessonsOn, parityOf } from '../src/lib/week'
import { IconList, IconCalendar, IconSettings, IconPlus, IconCheck, IconChevronRight, IconChevronDown, IconX } from '../src/components/icons'
import { Calendar, Editor, Modal } from './components'
import { ANCHOR_MONDAY, DEFAULT_LESSONS, DEFAULT_SUBJECTS, INITIAL_TASKS, EXTRA_TASKS, TODAY, subjectName, kindName, type DemoTask, type Draft } from './data'
import { version } from '../package.json'
import './style.css'

type Tab = 'tasks' | 'schedule' | 'settings'
type Theme = 'light' | 'dark' | 'system'
type Panel = 'subjects' | 'backup' | 'about' | null
const query = new URLSearchParams(location.search)
const longDate = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const weekday = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { weekday: 'long' })
const relativeDate = (date: string) => date < TODAY ? 'Просрочено' : date === TODAY ? 'Сегодня' : date === addDays(TODAY, 1) ? 'Завтра' : 'Позже'

function SettingIcon({ kind }: { kind: 'book' | 'cloud' | 'info' | 'sun' }) {
  return <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'book' ? <><path d="M12 5C9 3 5 3 2 5v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0Z" /><path d="M12 5v15" /></> : kind === 'cloud' ? <path d="M7 19h11a4 4 0 0 0 1-7.87A6 6 0 0 0 7.2 9 5 5 0 0 0 7 19Z" /> : kind === 'info' ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>}
  </svg>
}

function TaskRow({ task, toggle, edit }: { task: DemoTask; toggle: (id: string) => void; edit: (task: DemoTask) => void }) {
  return <div className={`task-row ${task.done ? 'completed' : ''}`}>
    <button className="check-button" onClick={() => toggle(task.id)} aria-label={`${task.done ? 'Вернуть' : 'Выполнить'}: ${task.title}`} aria-pressed={task.done}><span>{task.done && <IconCheck size={17} />}</span></button>
    <button className="task-content" onClick={() => edit(task)}><span className="task-subject">{subjectName(task.subjectId)}</span><span className="task-title">{task.title}</span><IconChevronRight size={16} /></button>
  </div>
}

function App() {
  const [tab, setTab] = useState<Tab>(query.get('screen') === 'schedule' ? 'schedule' : query.get('screen') === 'settings' ? 'settings' : 'tasks')
  const [theme, setTheme] = useState<Theme>(query.get('theme') === 'dark' ? 'dark' : 'light')
  const [tasks, setTasks] = useState<DemoTask[]>(query.get('fixture') === 'empty' ? [] : query.get('fixture') === 'stress' ? [...INITIAL_TASKS, ...EXTRA_TASKS] : INITIAL_TASKS)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [showDone, setShowDone] = useState(false)
  const [date, setDate] = useState(TODAY)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
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
  const openNew = (lesson?: Lesson) => setDraft({ subjectId: lesson?.subjectId || '', title: '', due: tab === 'schedule' ? date : TODAY, kind: lesson?.kind, lessonId: lesson?.id, locked: Boolean(lesson) })
  const save = (value: Draft) => {
    setTasks(items => value.id ? items.map(t => t.id === value.id ? { ...t, ...value } : t) : [...items, { ...value, id: crypto.randomUUID(), done: false }])
    setDraft(null); setNotice(value.id ? 'Изменения сохранены' : 'Задание добавлено')
  }
  const remove = (id: string) => { setRemoved(tasks.find(t => t.id === id) || null); setTasks(items => items.filter(t => t.id !== id)); setDraft(null) }
  const visible = tasks.filter(t => !t.done)
  const days = [...new Set(visible.map(t => t.due))].sort()
  const done = tasks.filter(t => t.done)
  const lessons = lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY)
  const ownTasks = tasks.filter(t => t.due === date)
  const assigned = new Set<string>()
  const row = (task: DemoTask) => <TaskRow key={task.id} task={task} toggle={toggle} edit={setDraft} />
  const changeTab = (next: Tab) => { setTab(next); window.scrollTo({ top: 0 }) }

  return <div className="app-shell">
    <nav className="app-nav" aria-label="Основные вкладки">
      <span className="desktop-brand">ДЗ<span>Учебный планер</span></span>
      {([{ key: 'tasks', label: 'Задачи', icon: IconList }, { key: 'schedule', label: 'Расписание', icon: IconCalendar }, { key: 'settings', label: 'Настройки', icon: IconSettings }] as const).map(item => <button key={item.key} aria-current={tab === item.key ? 'page' : undefined} onClick={() => changeTab(item.key)}><item.icon size={25} /><span>{item.label}</span></button>)}
      <span className="desktop-footer">Лист · превью {version}</span>
    </nav>
    <main className={`app-main screen-${tab}`}>
      <header className="page-header"><h1>{tab === 'tasks' ? 'Задачи' : tab === 'schedule' ? 'Расписание' : 'Настройки'}</h1>{tab === 'tasks' && <button className="text-button add-action" onClick={() => openNew()}><IconPlus size={23} />Добавить</button>}</header>
      {tab === 'tasks' && <div className="task-list">
        {!visible.length && <div className="empty-state"><IconCheck size={30} /><h2>{tasks.length ? 'Всё выполнено' : 'Пока нет заданий'}</h2><p>{tasks.length ? 'Выполненные задания останутся внизу.' : 'Добавь первое — предмет и срок можно выбрать сразу.'}</p><button className="text-button" onClick={() => openNew()}><IconPlus size={19} />Добавить задание</button></div>}
        {days.map(day => <section className={`day-section ${day < TODAY ? 'overdue' : ''}`} key={day}>
          <button className="day-heading" onClick={() => setCollapsed(list => list.includes(day) ? list.filter(d => d !== day) : [...list, day])} aria-expanded={!collapsed.includes(day)}>
            <span><span className="relative-date">{relativeDate(day)}</span><h2>{longDate(day)}{parseISO(day).getFullYear() !== parseISO(TODAY).getFullYear() && <small> {parseISO(day).getFullYear()}</small>}</h2></span><span className="day-weekday">{weekday(day)}<IconChevronDown size={14} className={collapsed.includes(day) ? 'rotated' : ''} /></span>
          </button>
          {!collapsed.includes(day) && visible.filter(t => t.due === day).map(row)}
        </section>)}
        {done.length > 0 && <section className="done-section"><button className="done-heading" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}><IconCheck size={18} />Выполнено <span>{done.length}</span><IconChevronDown size={16} className={!showDone ? 'rotated' : ''} /></button>{showDone && done.map(row)}</section>}
      </div>}
      {tab === 'schedule' && <div className="schedule-layout"><section className="calendar-section" aria-label="Календарь расписания"><Calendar value={date} onChange={setDate} /><button className="text-button today-button" onClick={() => setDate(TODAY)}>Сегодня</button></section><section className="agenda">
        <div className="agenda-heading"><h2>{WEEKDAYS_SHORT[(parseISO(date).getDay() + 6) % 7]}, {longDate(date)}</h2><span>{parityOf(date, ANCHOR_MONDAY) === 'num' ? 'Числитель' : 'Знаменатель'}</span></div>
        {!lessons.length && <div className="empty-state"><IconCalendar size={28} /><h2>День без пар</h2><p>Задания на этот день можно добавить отдельно.</p></div>}
        {lessons.map(lesson => {
          const attached = ownTasks.filter(t => !assigned.has(t.id) && (t.lessonId ? t.lessonId === lesson.id : Boolean(t.kind) && t.kind === lesson.kind && t.subjectId === lesson.subjectId))
          attached.forEach(t => assigned.add(t.id))
          return <article className="lesson" key={lesson.id}><div className="lesson-time"><time>{lesson.start}</time><span>–</span><time>{lesson.end}</time></div><div className="lesson-body"><div className="lesson-title"><h3>{subjectName(lesson.subjectId)}</h3><button className="icon-button" aria-label={`Добавить: ${subjectName(lesson.subjectId)}, ${kindName[lesson.kind]}, ${lesson.start}`} onClick={() => openNew(lesson)}><IconPlus size={19} /></button></div><p>{kindName[lesson.kind]}{lesson.room && ` · ${lesson.room}`}</p>{lesson.building && <p className="lesson-detail">{lesson.building}</p>}{attached.map(row)}</div></article>
        })}
        {ownTasks.some(t => !assigned.has(t.id)) && <section className="day-extra"><h3>Сдать в этот день</h3>{ownTasks.filter(t => !assigned.has(t.id)).map(row)}</section>}
        <button className="text-button agenda-add" onClick={() => openNew()}><IconPlus size={19} />Добавить задание на этот день</button>
      </section></div>}
      {tab === 'settings' && <div className="settings-list">
        <section className="appearance"><h2>Оформление</h2><div className="theme-options" aria-label="Оформление">{([{ id: 'light', label: 'Светлая' }, { id: 'dark', label: 'Тёмная' }, { id: 'system', label: 'Системная' }] as const).map(t => <button key={t.id} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>{t.label}</button>)}</div></section>
        <button className="setting-row" onClick={() => setPanel('subjects')}><SettingIcon kind="book" /><span><strong>Предметы</strong><small>Список предметов и аттестации</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => changeTab('schedule')}><IconCalendar size={27} /><span><strong>Расписание</strong><small>Учебные недели и время занятий</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => setPanel('backup')}><SettingIcon kind="cloud" /><span><strong>Резервная копия</strong><small>Сохранение и перенос данных</small></span><IconChevronRight size={18} /></button>
        <button className="setting-row" onClick={() => setPanel('about')}><SettingIcon kind="info" /><span><strong>О приложении</strong><small>Версия {version}</small></span><IconChevronRight size={18} /></button>
      </div>}
      <details className="preview-tools"><summary>Демонстрационный макет</summary><p>Изменения хранятся до перезагрузки. Сегодня в примерах — 21 сентября 2026.</p><div><button onClick={() => { setTasks(INITIAL_TASKS); setCollapsed([]); setRemoved(null); setShowDone(false) }}>Исходный список</button><button onClick={() => { setTasks([...INITIAL_TASKS, ...EXTRA_TASKS]); setCollapsed([]); setShowDone(true); setRemoved(null) }}>Длинные записи и просрочка</button><button onClick={() => { setTasks([]); setRemoved(null) }}>Пустой список</button></div></details>
    </main>
    {removed ? <div className="toast" role="status">Задание удалено<button onClick={() => { setTasks(items => [...items, removed]); setRemoved(null) }}>Отменить</button><button aria-label="Закрыть сообщение" onClick={() => setRemoved(null)}><IconX size={17} /></button></div> : notice && <div className="toast" role="status">{notice}<IconCheck size={18} /></div>}
    {draft && <Editor draft={draft} save={save} remove={remove} close={() => setDraft(null)} />}
    {panel && <Modal title={panel === 'subjects' ? 'Предметы' : panel === 'backup' ? 'Резервная копия' : 'О приложении'} onClose={() => setPanel(null)}><div className="info-panel">{panel === 'subjects' ? <>{DEFAULT_SUBJECTS.map(s => <div className="subject-row" key={s.id}><span className={`subject-dot tone-${s.assessment}`} /><div><strong>{s.name}</strong><small>{{ exam: 'Экзамен', dist: 'Распределённый экзамен', credit: 'Зачёт', other: 'Без аттестации' }[s.assessment]}</small></div></div>)}</> : panel === 'backup' ? <><p>Сохранение и восстановление появятся после подключения постоянного хранения.</p><p>Сейчас здесь демонстрационные задания. Твои данные из прежней версии не изменяются.</p></> : <><h3>ДЗ · Лист</h3><p>Задания, сроки и расписание для своей учёбы.</p><p>Версия {version} · макет на демоданных.</p></>}</div></Modal>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
