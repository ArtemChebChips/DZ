import { useMemo, useState } from 'react'
import { useData } from '../store'
import {
  MONTHS_NOM,
  WEEKDAYS_SHORT,
  addDays,
  diffDays,
  formatFull,
  mondayOf,
  parseISO,
  todayISO,
  toISO,
} from '../lib/dates'
import { lessonsOn, parityOf, parityShort } from '../lib/week'
import { colorOf } from '../lib/palette'
import { navigate, routes } from '../lib/router'
import { Screen, IconButton, Button } from '../components/ui'
import { IconChevronLeft, IconChevronRight } from '../components/icons'

/** Недели месяца: полные строки от понедельника до воскресенья. */
function buildWeeks(year: number, month: number): string[][] {
  const first = toISO(new Date(year, month, 1))
  const last = toISO(new Date(year, month + 1, 0))
  const weeks: string[][] = []
  let cursor = mondayOf(first)
  while (cursor <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)))
    cursor = addDays(cursor, 7)
  }
  return weeks
}

export function CalendarScreen() {
  const { subjects, lessons, tasks, settings } = useData()
  const today = todayISO()
  const [anchor, setAnchor] = useState(today)

  const cursor = parseISO(anchor)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const weeks = useMemo(() => buildWeeks(year, month), [year, month])
  const bySubject = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  /** Цвета предметов, по которым в этот день что-то сдавать. */
  const dotsByDate = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const task of tasks) {
      if (task.done) continue
      const color = colorOf(bySubject.get(task.subjectId)?.color)
      const list = map.get(task.due) ?? []
      if (!list.includes(color)) list.push(color)
      map.set(task.due, list)
    }
    return map
  }, [tasks, bySubject])

  const shiftMonth = (delta: number) => setAnchor(toISO(new Date(year, month + delta, 1)))

  return (
    <Screen
      title="Календарь"
      subtitle="Расписание и сроки сдачи"
    >
      <div className="calendar-month">
        <h2>{MONTHS_NOM[month]} <span>{year}</span></h2>
        <div className="flex">
          <IconButton onClick={() => shiftMonth(-1)} label="Предыдущий месяц"><IconChevronLeft /></IconButton>
          <IconButton onClick={() => shiftMonth(1)} label="Следующий месяц"><IconChevronRight /></IconButton>
        </div>
      </div>
      {/* Первая узкая колонка — метка чётности недели, чтобы не сорить ею в каждом дне. */}
      <div className="grid grid-cols-[1.4rem_repeat(7,1fr)] gap-1 mb-1 px-0.5">
        <span />
        {WEEKDAYS_SHORT.map((d) => (
          <span key={d} className="text-center text-[12px] text-muted py-2">
            {d}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {weeks.map((week) => {
          const parity = parityOf(week[0], settings.anchorMonday)
          return (
            <div key={week[0]} className="grid grid-cols-[1.4rem_repeat(7,1fr)] gap-1">
              <span
                title={parity === 'num' ? 'Числитель' : 'Знаменатель'}
                className={`grid place-items-center text-[12px] font-semibold rounded-lg ${
                  parity === 'num' ? 'text-accent' : 'text-warn'
                }`}
              >
                {parityShort(parity)}
              </span>

              {week.map((iso) => {
                const d = parseISO(iso)
                const otherMonth = d.getMonth() !== month
                const isToday = iso === today
                const dots = dotsByDate.get(iso) ?? []
                const overdue = dots.length > 0 && diffDays(today, iso) < 0
                const hasLessons = lessonsOn(iso, lessons, settings.anchorMonday).length > 0

                return (
                  <button
                    key={iso}
                    type="button"
                    aria-label={`${formatFull(iso)}${dots.length ? ', есть задания' : ''}`}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => navigate(routes.day(iso))}
                    className={`aspect-square min-h-11 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition active:scale-95 ${
                      isToday
                        ? 'border-accent bg-accent/10'
                        : hasLessons
                          ? 'border-line bg-surface'
                          : 'border-transparent bg-surface/50'
                    } ${otherMonth ? 'opacity-40' : ''}`}
                  >
                    <span
                      className={`text-[16px] leading-none ${
                        isToday ? 'text-accent font-semibold' : overdue ? 'text-danger' : ''
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <span className="flex gap-0.5 h-1.5 items-center">
                      {dots.slice(0, 4).map((color, i) => (
                        <span
                          key={`${iso}-${i}`}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: color }}
                        />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="calendar-legend"><span><b className="text-accent">Ч</b> — числитель</span><span><b className="text-warn">З</b> — знаменатель</span></div>
      <div className="flex gap-2 mt-4">
        <Button variant="ghost" onClick={() => setAnchor(today)} className="flex-1">
          Текущий месяц
        </Button>
        <Button variant="ghost" onClick={() => navigate(routes.day(today))} className="flex-1">
          Открыть сегодня
        </Button>
      </div>
    </Screen>
  )
}
