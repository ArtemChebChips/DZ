import test from 'node:test'
import assert from 'node:assert/strict'
import { homeworkLessons, taskLesson } from '../design/homework.ts'
import { DEFAULT_LESSONS } from '../src/data/schedule.ts'
import { freshNotebook, persistNotebook, readNotebook } from '../design/storage.ts'

const monday = parity => DEFAULT_LESSONS.filter(l => l.weekday === 1 && (l.parity === parity || l.parity === 'both'))

test('Семинар физики не подменяется лекцией', () => {
  const lessons = monday('denom')
  assert.deepEqual(homeworkLessons('phys', lessons).map(l => l.id), ['pn-4'])
  assert.equal(taskLesson({ subjectId: 'phys' }, lessons)?.id, 'pn-4')
})

test('Две лабы требуют выбора; явная связь ведёт ко второй', () => {
  const lessons = monday('num')
  assert.deepEqual(homeworkLessons('phys', lessons).map(l => l.id), ['pn-3', 'pn-5'])
  assert.equal(taskLesson({ subjectId: 'phys', kind: 'lab' }, lessons), undefined)
  assert.equal(taskLesson({ subjectId: 'phys', kind: 'lab', lessonId: 'pn-5' }, lessons)?.start, '17:35')
})

test('Семинар и лабораторная одного дня различимы', () => {
  const lab = { ...monday('num').find(l => l.id === 'pn-3'), id: 'test-lab' }
  const lessons = [...monday('denom'), lab]
  assert.equal(taskLesson({ subjectId: 'phys' }, lessons), undefined)
  assert.equal(taskLesson({ subjectId: 'phys', kind: 'seminar' }, lessons)?.id, 'pn-4')
  assert.equal(taskLesson({ subjectId: 'phys', kind: 'lab' }, lessons)?.id, 'test-lab')
})

test('Исчезнувшая или несовместимая явная связь не заменяется другой парой', () => {
  for (const task of [
    { subjectId: 'phys', lessonId: 'removed' },
    { subjectId: 'mech', lessonId: 'pn-4' },
    { subjectId: 'phys', kind: 'lab', lessonId: 'pn-4' },
  ]) assert.equal(taskLesson(task, monday('denom')), undefined)
})

test('Лекции не предлагаются, прежняя явная привязка к лекции сохраняется', () => {
  assert.deepEqual(homeworkLessons('matchem', monday('denom')), [])
  assert.equal(taskLesson({ subjectId: 'phys', kind: 'lecture' }, monday('denom')), undefined)
  assert.equal(taskLesson({ subjectId: 'phys', kind: 'lecture', lessonId: 'pn-2' }, monday('denom'))?.id, 'pn-2')
  assert.equal(taskLesson({ subjectId: 'phys' }, []), undefined)
})

test('Срок и точная пара переживают сохранение; изменение расписания не меняет запись', () => {
  const task = { id: 'second-lab', title: 'Отчёт', subjectId: 'phys', due: '2026-09-28', kind: 'lab', lessonId: 'pn-5', done: false }
  let raw
  const storage = { setItem: (_, v) => { raw = v }, getItem: () => raw }
  persistNotebook(storage, { ...freshNotebook(), tasks: [task] })
  const restored = readNotebook(storage).tasks[0]
  assert.equal(taskLesson(restored, monday('num'))?.id, 'pn-5')
  assert.equal(taskLesson(restored, monday('denom')), undefined)
  assert.deepEqual(restored, task)
})
