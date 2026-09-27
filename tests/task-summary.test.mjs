import test from 'node:test'
import assert from 'node:assert/strict'
import { taskSummary } from '../design/task-summary.ts'

const task = { id: '1', title: 'Текст', subjectId: 'phys', due: '2026-09-28', done: false }
test('Счётчик дней: формы 1/2/5/11/21 для заданий и заметок', () => {
  for (const [n, homework, notes] of [[1, 'задание', 'заметка'], [2, 'задания', 'заметки'], [5, 'заданий', 'заметок'], [11, 'заданий', 'заметок'], [21, 'задание', 'заметка']]) {
    const tasks = Array.from({ length: n }, (_, i) => ({ ...task, id: String(i) }))
    assert.equal(taskSummary(tasks), `${n} ${homework}`)
    assert.equal(taskSummary(tasks.map(t => ({ ...t, entryType: 'note' }))), `${n} ${notes}`)
  }
})
test('Счётчик исключает выполненное, отдельно считает заметки и меняется после отмены', () => {
  const tasks = [{ ...task }, { ...task, id: '2', done: true }, { ...task, id: '3', subjectId: '' }]
  assert.equal(taskSummary(tasks), '1 задание, 1 заметка')
  tasks[1].done = false
  assert.equal(taskSummary(tasks), '2 задания, 1 заметка')
  assert.equal(taskSummary(tasks.map(t => ({ ...t, done: true }))), 'Нет заданий')
})
