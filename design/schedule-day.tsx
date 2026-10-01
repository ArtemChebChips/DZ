import { Fragment, type CSSProperties, type ReactNode, type RefObject } from 'react'
import type { Lesson } from '../src/types'
import { parseISO } from '../src/lib/dates'
import { lessonsOn } from '../src/lib/week'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '../src/components/icons'
import { ANCHOR_MONDAY, DEFAULT_LESSONS, subjectName, kindName, type DemoTask } from './data'
import { academicWeek } from './academic-week'
import { lessonBreaks } from './breaks'
import { taskLesson, isHomeworkKind, isDayNote } from './homework'
import { isCurrentInterval } from './current-interval'
import { usePressAction } from './use-button-feedback'

const longDate = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const weekday = (date: string) => parseISO(date).toLocaleDateString('ru-RU', { weekday: 'long' })
const minutes = new Intl.NumberFormat('ru-RU', { style: 'unit', unit: 'minute', unitDisplay: 'long' })

export function ScheduleDay({ date, today, minute, tasks, preview, position, scrollRef, openCalendar, selectDay, shiftDay, openLesson, row, banner, children }: {
  date: string; today: string; minute: number; tasks: DemoTask[]; preview: boolean; position: number; scrollRef?: RefObject<HTMLDivElement | null>;
  openCalendar: () => void; selectDay: (date: string) => void; shiftDay: (direction: -1 | 1) => void;
  openLesson: (lesson: Lesson) => void; row: (task: DemoTask) => ReactNode; banner?: ReactNode; children?: ReactNode;
}) {
  const press = usePressAction()
  const tapLesson = (lesson: Lesson) => { if (!preview) openLesson(lesson) }
  const weekNumber = academicWeek(date, ANCHOR_MONDAY)
  const lessons = lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY)
  const breaks = lessonBreaks(lessons)
  const ownTasks = tasks.filter(t => t.due === date)
  const assigned = new Set<string>()
  return <div className="day-page" style={{ '--day-position': position } as CSSProperties} data-current={!preview || undefined} aria-hidden={preview || undefined} inert={preview}>
    <div className="screen-header">
      <header className="agenda-heading">
        <div className="agenda-title-row"><h1 className="agenda-day">{date === today ? 'Сегодня' : weekday(date)},</h1>{weekNumber && <button className="week-number-button" onClick={press(openCalendar)} aria-label={`Учебная неделя ${weekNumber}, открыть календарь`}>Неделя {weekNumber}</button>}</div>
        <div className="agenda-date-row">
          <time className="agenda-date" dateTime={date}>{longDate(date)}</time>
          <div className="agenda-controls">
            {date !== today && <button className="outline-button today-button" onClick={press(() => selectDay(today))}>Сегодня</button>}
            <button className="outline-button calendar-toggle" aria-label="Календарь" onClick={press(openCalendar)}><IconCalendar size={26} /></button>
          </div>
        </div>
        <div className="day-stepper"><button className="icon-button" aria-label="Предыдущий день" onClick={() => shiftDay(-1)}><IconChevronLeft size={18} /></button><button className="icon-button" aria-label="Следующий день" onClick={() => shiftDay(1)}><IconChevronRight size={18} /></button></div>
      </header>
    </div>
    <div ref={scrollRef} className="app-scroll" tabIndex={preview ? undefined : 0} role="region" aria-label="Расписание на выбранный день" data-scroll-region>
      {banner}
      <section className="agenda">
        {!lessons.length && <div className="empty-state"><IconCalendar size={28} /><h2>День без пар</h2><p>Задания на этот день можно добавить отдельно.</p></div>}
        {lessons.map(lesson => {
          const attached = ownTasks.filter(t => taskLesson(t, lessons)?.id === lesson.id)
          attached.forEach(t => assigned.add(t.id))
          const pause = breaks.get(lesson.id)
          const current = isCurrentInterval(date, today, minute, lesson)
          const currentBreak = pause && isCurrentInterval(date, today, minute, pause)
          return <Fragment key={lesson.id}>{pause && <p className={`lesson-break ${currentBreak ? 'break-current' : ''}`} aria-current={currentBreak ? 'time' : undefined}><time>{pause.start}–{pause.end}</time><span className="break-label"><strong>Перерыв</strong>{currentBreak && <span className="break-now">Сейчас</span>}</span><span className="break-duration">{minutes.format(pause.minutes)}</span></p>}<article aria-current={current ? 'time' : undefined} className={`lesson ${current ? 'lesson-current' : ''}`}><button className="lesson-open" aria-label={`Добавить ${isHomeworkKind(lesson.kind) ? 'задание' : 'заметку'}: ${subjectName(lesson.subjectId)}, ${kindName[lesson.kind]}, ${lesson.start}`} onClick={() => tapLesson(lesson)} /><div className="lesson-time"><time>{lesson.start}</time><span>–</span><time>{lesson.end}</time></div><div className="lesson-body"><div className="lesson-title"><h3>{subjectName(lesson.subjectId)}</h3><span className="current-label" aria-hidden={!current}>Сейчас</span></div><p className="lesson-meta"><span>{kindName[lesson.kind]}</span>{lesson.room && <span>{/^каф\./i.test(lesson.room) ? lesson.room : 'Ауд. ' + lesson.room}</span>}</p>{lesson.teacher && <p className="lesson-detail">{lesson.teacher}</p>}{attached.map(t => row(t))}</div></article></Fragment>
        })}
        {ownTasks.some(t => !isDayNote(t) && !assigned.has(t.id)) && <section className="day-extra"><h3>Без привязки к паре</h3><p className="binding-hint">Открой задание, чтобы выбрать занятие.</p>{ownTasks.filter(t => !isDayNote(t) && !assigned.has(t.id)).map(t => row(t))}</section>}
        {ownTasks.some(isDayNote) && <section className="day-extra"><h3>Заметки на день</h3>{ownTasks.filter(isDayNote).map(t => row(t))}</section>}
      </section>
      {children}
    </div>
  </div>
}
