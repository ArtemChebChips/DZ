import test from 'node:test'
import assert from 'node:assert/strict'
import { completedTasks } from '../design/history.ts'
test('История сортирует сроки и ID, не меняя исходные записи и отметки', () => {
  const tasks = [
    { id: 'z', due: '2026-09-20', done: true, testBatchId: 'test' },
    { id: 'b', due: '2026-09-22', done: true },
    { id: 'a', due: '2026-09-22', done: true },
    { id: 'active', due: '2026-10-01', done: false },
  ]
  const before = structuredClone(tasks)
  assert.deepEqual(completedTasks(tasks).map(t => t.id), ['a', 'b', 'z'])
  assert.deepEqual(tasks, before)
  assert.equal(completedTasks(tasks)[2], tasks[0])
})
