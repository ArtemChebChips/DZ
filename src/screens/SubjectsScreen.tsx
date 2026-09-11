import { useState } from 'react'
import type { Subject } from '../types'
import { addSubject, deleteSubject, updateSubject, useData } from '../store'
import { ASSESSMENTS, assessmentLabel, subjectColor } from '../lib/palette'
import { goBack } from '../lib/router'
import { Screen, Button, Field, Sheet, IconButton, EmptyState, inputClass } from '../components/ui'
import { IconChevronLeft, IconPlus, IconTrash } from '../components/icons'

function SubjectForm({ subject, onClose }: { subject?: Subject; onClose: () => void }) {
  const { lessons, tasks } = useData()
  const [name, setName] = useState(subject?.name ?? '')
  const [short, setShort] = useState(subject?.short ?? '')
  const [assessment, setAssessment] = useState<Subject['assessment']>(subject?.assessment ?? 'credit')

  function save() {
    const payload = {
      name: name.trim(),
      short: short.trim() || undefined,
      assessment,
    }
    if (!payload.name) return
    if (subject) updateSubject(subject.id, payload)
    else addSubject(payload)
    onClose()
  }

  function remove() {
    if (!subject) return
    const usedLessons = lessons.filter((l) => l.subjectId === subject.id).length
    const usedTasks = tasks.filter((t) => t.subjectId === subject.id).length
    const warning = usedLessons || usedTasks
      ? `\nВместе с ним удалятся пары (${usedLessons}) и задания (${usedTasks}).`
      : ''
    if (confirm(`Удалить «${subject.name}»?${warning}`)) {
      deleteSubject(subject.id)
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title={subject ? 'Предмет' : 'Новый предмет'}>
      <Field label="Название">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!subject}
          placeholder="Математический анализ"
          className={inputClass}
        />
      </Field>
      <Field label="Короткое имя (для календаря)">
        <input
          value={short}
          onChange={(e) => setShort(e.target.value)}
          placeholder="Матан"
          className={inputClass}
        />
      </Field>
      <Field label="Чем заканчивается">
        <div className="flex gap-1.5 flex-wrap">
          {ASSESSMENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAssessment(option.value)}
              className={`flex items-center gap-2 px-3 h-10 rounded-xl border text-[14px] transition ${
                assessment === option.value
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-line bg-surface-2 text-muted'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: subjectColor(option.value) }}
              />
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex gap-2 pt-2">
        {subject ? (
          <button
            type="button"
            onClick={remove}
            aria-label="Удалить предмет"
            className="shrink-0 grid place-items-center w-11 h-11 rounded-xl border border-danger/40 text-danger active:scale-95 transition"
          >
            <IconTrash size={20} />
          </button>
        ) : null}
        <Button onClick={save} disabled={!name.trim()} className="flex-1">
          Сохранить
        </Button>
      </div>
    </Sheet>
  )
}

export function SubjectsScreen() {
  const { subjects, lessons } = useData()
  const [editing, setEditing] = useState<Subject | 'new' | null>(null)

  return (
    <>
      <Screen
        title="Предметы"
        subtitle="Название и вид аттестации"
        left={
          <IconButton onClick={goBack} label="Назад">
            <IconChevronLeft />
          </IconButton>
        }
        right={
          <IconButton onClick={() => setEditing('new')} label="Добавить предмет">
            <IconPlus />
          </IconButton>
        }
      >
        {subjects.length === 0 ? <EmptyState title="Предметов пока нет" /> : null}

        <div className="flex flex-col gap-2">
          {subjects.map((subject) => {
            const count = lessons.filter((l) => l.subjectId === subject.id).length
            return (
              <button
                key={subject.id}
                type="button"
                onClick={() => setEditing(subject)}
                className="flex items-center gap-3 bg-surface rounded-2xl border border-line px-3 py-3 text-left"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: subjectColor(subject.assessment) }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] truncate">{subject.name}</span>
                  <span className="block text-[12px] text-muted truncate">
                    {`${assessmentLabel(subject.assessment)} · ${count} пар`}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </Screen>

      {editing ? (
        <SubjectForm
          subject={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
