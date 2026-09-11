import { useMemo, useState } from 'react'
import type { Lesson, Subject, Weekday } from '../types'
import { addLesson, addSubject, deleteLesson, setThisWeekAsNumerator, updateLesson, useData } from '../store'
import { WEEKDAYS_FULL, todayISO } from '../lib/dates'
import { ASSESSMENTS, subjectColor } from '../lib/palette'
import { parityLabel, parityOf } from '../lib/week'
import { goBack } from '../lib/router'
import { Screen, Button, Field, Sheet, IconButton, EmptyState, inputClass } from '../components/ui'
import { IconChevronLeft, IconPlus, IconTrash } from '../components/icons'

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6]

const PARITY_OPTIONS: { value: Lesson['parity']; label: string }[] = [
  { value: 'both', label: 'Каждую' },
  { value: 'num', label: 'Числитель' },
  { value: 'denom', label: 'Знаменатель' },
]

const KIND_OPTIONS: { value: Lesson['kind']; label: string }[] = [
  { value: 'lecture', label: 'Лекция' },
  { value: 'seminar', label: 'Семинар' },
  { value: 'lab', label: 'Лаб. работа' },
  { value: 'other', label: 'Другое' },
]

/** Длинные названия не влезают в календарь, поэтому берём первое слово как короткое. */
function shortFrom(name: string): string | undefined {
  if (name.length <= 14) return undefined
  const first = name.split(/[\s,]+/)[0]
  return first.length >= 3 ? first : undefined
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-3 h-10 rounded-xl border text-[14px] transition ${
            value === option.value
              ? 'border-accent bg-accent/10 text-ink'
              : 'border-line bg-surface-2 text-muted'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Заводит предмет, не выходя из формы пары. */
function NewSubjectInline({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [assessment, setAssessment] = useState<Subject['assessment']>('credit')

  function create() {
    const clean = name.trim()
    if (!clean) return
    const subject = addSubject({ name: clean, short: shortFrom(clean), assessment })
    onCreated(subject.id)
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 pl-2 pr-3 h-9 rounded-xl border border-dashed border-line bg-surface-2 text-muted text-[14px]"
      >
        <IconPlus size={16} />
        Новый предмет
      </button>
    )
  }

  return (
    <div className="w-full pill p-3 flex flex-col gap-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') create()
        }}
        autoFocus
        placeholder="Название предмета"
        className={inputClass}
      />
      <Segmented
        value={assessment}
        options={ASSESSMENTS.map((a) => ({ value: a.value, label: a.label }))}
        onChange={setAssessment}
      />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)} className="flex-1">
          Отмена
        </Button>
        <Button onClick={create} disabled={!name.trim()} className="flex-1">
          Создать
        </Button>
      </div>
    </div>
  )
}

function LessonForm({
  lesson,
  defaults,
  onClose,
}: {
  lesson?: Lesson
  defaults?: { weekday: Weekday }
  onClose: () => void
}) {
  const { subjects } = useData()
  const [subjectId, setSubjectId] = useState(lesson?.subjectId ?? subjects[0]?.id ?? '')
  const [weekday, setWeekday] = useState<Weekday>(lesson?.weekday ?? defaults?.weekday ?? 1)
  const [start, setStart] = useState(lesson?.start ?? '11:50')
  const [end, setEnd] = useState(lesson?.end ?? '13:20')
  const [parity, setParity] = useState<Lesson['parity']>(lesson?.parity ?? 'both')
  const [kind, setKind] = useState<Lesson['kind']>(lesson?.kind ?? 'seminar')
  const [room, setRoom] = useState(lesson?.room ?? '')
  const [building, setBuilding] = useState(lesson?.building ?? '')
  const [teacher, setTeacher] = useState(lesson?.teacher ?? '')

  function save() {
    if (!subjectId || !start || !end) return
    const payload = {
      subjectId,
      weekday,
      start,
      end,
      parity,
      kind,
      room: room.trim() || undefined,
      building: building.trim() || undefined,
      teacher: teacher.trim() || undefined,
    }
    if (lesson) updateLesson(lesson.id, payload)
    else addLesson(payload)
    onClose()
  }

  function remove() {
    if (lesson && confirm('Удалить эту пару из расписания?')) {
      deleteLesson(lesson.id)
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title={lesson ? 'Пара' : 'Новая пара'}>
      <Field label="Предмет">
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSubjectId(s.id)}
              className={`flex items-center gap-2 pl-2.5 pr-3 h-9 rounded-xl border text-[14px] transition ${
                s.id === subjectId
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-line bg-surface-2 text-muted'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: subjectColor(s.assessment) }} />
              {s.short || s.name}
            </button>
          ))}
          <NewSubjectInline onCreated={setSubjectId} />
        </div>
      </Field>

      <Field label="День недели">
        <Segmented
          value={String(weekday)}
          options={WEEKDAYS.map((d) => ({ value: String(d), label: WEEKDAYS_FULL[d - 1].slice(0, 2) }))}
          onChange={(v) => setWeekday(Number(v) as Weekday)}
        />
      </Field>

      <Field label="Время">
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputClass}
          />
          <span className="text-muted">–</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputClass}
          />
        </div>
      </Field>

      <Field label="Неделя">
        <Segmented value={parity} options={PARITY_OPTIONS} onChange={setParity} />
      </Field>

      <Field label="Тип">
        <Segmented value={kind} options={KIND_OPTIONS} onChange={setKind} />
      </Field>

      <Field label="Аудитория или кафедра">
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="301х или каф. ФН4"
          className={inputClass}
        />
      </Field>

      <Field label="Корпус">
        <input
          value={building}
          onChange={(e) => setBuilding(e.target.value)}
          placeholder="В1 ХимЛаб"
          className={inputClass}
        />
      </Field>

      <Field label="Преподаватель">
        <input
          value={teacher}
          onChange={(e) => setTeacher(e.target.value)}
          placeholder="Поликевич К. Б."
          className={inputClass}
        />
      </Field>

      <div className="flex gap-2 pt-2">
        {lesson ? (
          <button
            type="button"
            onClick={remove}
            aria-label="Удалить пару"
            className="shrink-0 grid place-items-center w-11 h-11 rounded-xl border border-danger/40 text-danger active:scale-95 transition"
          >
            <IconTrash size={20} />
          </button>
        ) : null}
        <Button onClick={save} disabled={!subjectId} className="flex-1">
          Сохранить
        </Button>
      </div>
    </Sheet>
  )
}

const PARITY_BADGE: Record<Lesson['parity'], { label: string; className: string }> = {
  both: { label: 'кажд.', className: 'text-muted border-line' },
  num: { label: 'числ.', className: 'text-accent border-accent/40' },
  denom: { label: 'знам.', className: 'text-warn border-warn/40' },
}

export function ScheduleScreen() {
  const { subjects, lessons, settings } = useData()
  const [editing, setEditing] = useState<Lesson | { weekday: Weekday } | null>(null)

  const bySubject = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const byDay = useMemo(() => {
    const map = new Map<Weekday, Lesson[]>(WEEKDAYS.map((d) => [d, []]))
    for (const lesson of lessons) map.get(lesson.weekday)?.push(lesson)
    for (const list of map.values()) {
      list.sort((a, b) => a.start.localeCompare(b.start) || a.parity.localeCompare(b.parity))
    }
    return map
  }, [lessons])

  const parity = parityOf(todayISO(), settings.anchorMonday)

  function shiftParity() {
    if (
      confirm(
        'Сдвинуть чётность на неделю?\nТекущая неделя станет числителем. Нужно, только если вуз сдвинул расписание.',
      )
    ) {
      setThisWeekAsNumerator()
    }
  }

  return (
    <>
      <Screen
        title="Расписание"
        subtitle={`${lessons.length} пар, с числителем и знаменателем`}
        left={
          <IconButton onClick={goBack} label="Назад">
            <IconChevronLeft />
          </IconButton>
        }
      >
        {/* Страховка на случай, если вуз сдвинет неделю: иначе чётность не починить. */}
        <div className="card flex items-center gap-3 px-3 py-2.5 mb-3">
          <span className="text-[13px] flex-1">
            Эта неделя — <span className="font-semibold text-accent">{parityLabel(parity).toLowerCase()}</span>
          </span>
          <button type="button" onClick={shiftParity} className="text-[13px] text-muted underline">
            сдвинуть
          </button>
        </div>

        {lessons.length === 0 ? (
          <EmptyState title="Расписание пустое" hint="Добавь первую пару кнопкой у дня недели" />
        ) : null}

        {WEEKDAYS.map((day) => {
          const dayLessons = byDay.get(day) ?? []
          return (
            <section key={day} className="mb-5">
              <div className="flex items-center gap-2 mb-2 px-1">
                <h2 className="flex-1 text-[13px] text-muted capitalize">{WEEKDAYS_FULL[day - 1]}</h2>
                <button
                  type="button"
                  onClick={() => setEditing({ weekday: day })}
                  aria-label={`Добавить пару в ${WEEKDAYS_FULL[day - 1]}`}
                  className="grid place-items-center w-8 h-8 rounded-lg bg-surface-2 border border-line text-muted active:scale-95 transition"
                >
                  <IconPlus size={16} />
                </button>
              </div>

              {dayLessons.length === 0 ? (
                <p className="text-[13px] text-muted/50 px-1">пар нет</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {dayLessons.map((lesson) => {
                    const subject = bySubject.get(lesson.subjectId)
                    const badge = PARITY_BADGE[lesson.parity]
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => setEditing(lesson)}
                        className="card flex items-center gap-3 px-3 py-2.5 text-left"
                      >
                        <span
                          className="w-1 self-stretch rounded-full shrink-0"
                          style={{ background: subjectColor(subject?.assessment) }}
                        />
                        <span className="w-11 shrink-0 text-[12px] leading-tight text-muted tabular-nums">
                          {lesson.start}
                          <br />
                          {lesson.end}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] truncate">{subject?.name ?? '—'}</span>
                          <span className="block text-[12px] text-muted truncate">
                            {[lesson.room, lesson.building].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-lg border text-[11px] ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </Screen>

      {editing ? (
        <LessonForm
          lesson={'id' in editing ? editing : undefined}
          defaults={'id' in editing ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
