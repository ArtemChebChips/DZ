import { useMemo, useState } from 'react'
import type { Lesson, LessonKind } from '../types'
import {
  MONTHS_NOM,
  WEEKDAYS_SHORT,
  addDays,
  mondayOf,
  parseISO,
  todayISO,
  toISO,
} from '../lib/dates'
import { lessonsOn } from '../lib/week'
import { LESSON_KINDS } from '../lib/palette'
import { haptic } from '../lib/haptics'
import { IconChevronLeft, IconChevronRight } from './icons'

/** Порядок в легенде — постоянный, чтобы точки не прыгали от месяца к месяцу. */
const KIND_ORDER: LessonKind[] = ['lecture', 'seminar', 'lab', 'other']

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

/**
 * Выбор дня вместо системного календаря: здесь видно, в какие дни у предмета
 * вообще есть пары — с учётом чётности недели.
 */
export function DayPicker({
  value,
  onChange,
  subjectId,
  kind,
  lessons,
  anchorMonday,
}: {
  value: string
  onChange: (date: string) => void
  subjectId?: string
  /** Задано, когда задание завели с плашки пары: подсвечиваем только такие занятия. */
  kind?: LessonKind
  lessons: Lesson[]
  anchorMonday: string
}) {
  const today = todayISO()
  const [anchor, setAnchor] = useState(value || today)

  const cursor = parseISO(anchor)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const weeks = useMemo(() => buildWeeks(year, month), [year, month])

  /** Дни месяца с парой по предмету и вид этой пары — по нему красим подсветку. */
  const dayKind = useMemo(() => {
    const days = new Map<string, LessonKind>()
    if (!subjectId) return days
    for (const week of weeks) {
      for (const iso of week) {
        const own = lessonsOn(iso, lessons, anchorMonday).filter((l) => l.subjectId === subjectId)
        const match = kind ? own.find((l) => l.kind === kind) : own[0]
        if (match) days.set(iso, match.kind)
      }
    }
    return days
  }, [weeks, lessons, anchorMonday, subjectId, kind])

  const kindsShown = useMemo(() => {
    const present = new Set(dayKind.values())
    return KIND_ORDER.filter((k) => present.has(k))
  }, [dayKind])

  const shiftMonth = (delta: number) => {
    haptic()
    setAnchor(toISO(new Date(year, month + delta, 1)))
  }

  return (
    <div className="pill p-2">
      <div className="flex items-center gap-1 mb-1">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Предыдущий месяц"
          className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-muted"
        >
          <IconChevronLeft size={18} />
        </button>
        <span className="flex-1 text-center text-[13px] font-semibold">
          {MONTHS_NOM[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Следующий месяц"
          className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-muted"
        >
          <IconChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {WEEKDAYS_SHORT.map((d) => (
          <span key={d} className="text-center text-[10px] text-muted py-0.5">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((iso) => {
          const d = parseISO(iso)
          const otherMonth = d.getMonth() !== month
          const selected = iso === value
          const lessonKind = dayKind.get(iso)
          const color = lessonKind ? LESSON_KINDS[lessonKind].color : undefined

          return (
            <button
              key={iso}
              type="button"
              onClick={() => {
                haptic()
                onChange(iso)
              }}
              className={`aspect-square rounded-xl grid place-items-center text-[13px] transition ${
                selected || color ? 'font-semibold' : ''
              } ${selected ? 'bg-accent' : ''} ${otherMonth && !selected ? 'opacity-35' : ''} ${
                iso === today && !selected && !color ? 'text-accent' : ''
              }`}
              /* Подсветка — кольцо цвета вида занятия: заливка занята выбранным днём. */
              style={
                selected
                  ? { color: 'var(--on-accent)' }
                  : color
                    ? { color, boxShadow: `inset 0 0 0 2px ${color}` }
                    : undefined
              }
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      {subjectId && kind ? (
        <p className="text-[11px] text-muted text-center mt-1.5">
          Подсвечены дни, когда есть {LESSON_KINDS[kind].label} по этому предмету
        </p>
      ) : null}

      {subjectId && !kind && kindsShown.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted mt-1.5">
          {kindsShown.map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: LESSON_KINDS[k].color }}
              />
              {LESSON_KINDS[k].label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
