import { useMemo, useState } from 'react'
import type { Lesson } from '../types'
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
import { haptic } from '../lib/haptics'
import { IconChevronLeft, IconChevronRight } from './icons'

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
  lessons,
  anchorMonday,
}: {
  value: string
  onChange: (date: string) => void
  subjectId?: string
  lessons: Lesson[]
  anchorMonday: string
}) {
  const today = todayISO()
  const [anchor, setAnchor] = useState(value || today)

  const cursor = parseISO(anchor)
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const weeks = useMemo(() => buildWeeks(year, month), [year, month])

  /** Дни месяца, когда у выбранного предмета есть пара. */
  const withLesson = useMemo(() => {
    if (!subjectId) return new Set<string>()
    const days = new Set<string>()
    for (const week of weeks) {
      for (const iso of week) {
        if (lessonsOn(iso, lessons, anchorMonday).some((l) => l.subjectId === subjectId)) {
          days.add(iso)
        }
      }
    }
    return days
  }, [weeks, lessons, anchorMonday, subjectId])

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
          const hasLesson = withLesson.has(iso)

          return (
            <button
              key={iso}
              type="button"
              onClick={() => {
                haptic()
                onChange(iso)
              }}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[13px] transition ${
                selected ? 'bg-accent font-semibold' : hasLesson ? 'bg-accent/12' : ''
              } ${otherMonth && !selected ? 'opacity-35' : ''} ${
                iso === today && !selected ? 'text-accent font-semibold' : ''
              }`}
              style={selected ? { color: 'var(--on-accent)' } : undefined}
            >
              {d.getDate()}
              {/* Точка под числом — в этот день у предмета есть пара. */}
              <span
                className="w-1 h-1 rounded-full"
                style={{
                  background: hasLesson
                    ? selected
                      ? 'var(--on-accent)'
                      : 'var(--c-accent)'
                    : 'transparent',
                }}
              />
            </button>
          )
        })}
      </div>

      {subjectId ? (
        <p className="text-[11px] text-muted text-center mt-1.5">
          Точкой отмечены дни, когда есть пара по этому предмету
        </p>
      ) : null}
    </div>
  )
}
