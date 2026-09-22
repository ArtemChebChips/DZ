import test from 'node:test'
import assert from 'node:assert/strict'
import { isDayNote, taskLesson } from '../design/homework.ts'
import { generateTestTasks, withoutTestTasks } from '../design/test-tasks.ts'
import { DEFAULT_LESSONS } from '../src/data/schedule.ts'
import { addDays, weekdayOf } from '../src/lib/dates.ts'
import { freshNotebook, persistNotebook, readNotebook, validateNotebook } from '../design/storage.ts'

const days = Array.from({ length: 21 }, (_, i) => {
  const date = addDays('2026-09-21', i)
  const parity = Math.floor(i / 7) % 2 ? 'num' : 'denom'
  return { date, lessons: DEFAULT_LESSONS.filter(l => l.weekday === weekdayOf(date) && (l.parity === 'both' || l.parity === parity)) }
})
const generated = generateTestTasks(days, 'batch', () => .42)

test('Заметка с предметом не попадает внутрь пары; старые личные записи остаются заметками', () => {
  assert(isDayNote({ subjectId: '' }))
  assert(!isDayNote({ subjectId: 'phys' }))
  assert(!isDayNote({ subjectId: '', entryType: 'homework' }))
  assert.equal(taskLesson({ subjectId: 'phys', entryType: 'note', lessonId: 'pn-4' }, DEFAULT_LESSONS), undefined)
})

test('24 примера на три недели содержат только реальные семинары/лабы и заметки', () => {
  assert.equal(generated.length, 24)
  assert.equal(generated.filter(isDayNote).length, 3)
  assert(generated.some(t => t.done) && generated.some(t => !t.done))
  assert(generated.some(t => t.title.length > 100))
  for (const task of generated) {
    assert(task.due >= days[0].date && task.due <= days.at(-1).date)
    if (!isDayNote(task)) {
      const actual = days.find(day => day.date === task.due).lessons.find(l => l.id === task.lessonId)
      assert.equal(actual.subjectId, task.subjectId)
      assert.equal(actual.kind, task.kind)
      assert(['seminar', 'lab'].includes(actual.kind))
    }
  }
  assert(validateNotebook({ ...freshNotebook(), tasks: generated }))
})

test('Замена, правка и очистка примеров не затрагивают личные записи с похожими ID/текстом', () => {
  const personal = { ...generated[0], id: 'batch-personal', testBatchId: undefined }
  const first = [personal, ...generated]
  const edited = first.map(t => t.testBatchId ? { ...t, title: 'Изменённый текст', done: !t.done } : t)
  const replacement = [...withoutTestTasks(edited), ...generateTestTasks(days, 'second', () => .1)]
  assert.equal(replacement.length, 25)
  assert.deepEqual(withoutTestTasks(replacement), [personal])
  let raw
  const storage = { setItem: (_, v) => { raw = v }, getItem: () => raw }
  const data = { ...freshNotebook(), tasks: edited, theme: 'dark', collapsed: ['2026-09-21'] }
  persistNotebook(storage, data)
  assert.deepEqual(readNotebook(storage), JSON.parse(JSON.stringify(data)))
  assert.deepEqual(withoutTestTasks(readNotebook(storage).tasks), JSON.parse(JSON.stringify([personal])))
})

test('Неизвестный тип записи и некорректная отметка тестового набора отклоняются', () => {
  for (const patch of [{ entryType: 'bad' }, { testBatchId: 1 }, { testBatchId: '' }, { testBatchId: '  ' }]) {
    assert.equal(validateNotebook({ ...freshNotebook(), tasks: [{ ...generated[0], ...patch }] }), false)
  }
})
