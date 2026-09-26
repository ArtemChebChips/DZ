import test from 'node:test'
import assert from 'node:assert/strict'
import { lessonBreaks } from '../design/breaks.ts'

test('Перерыв строго больше 40 минут, только между парами', () => {
  for (const [start, expected] of [['10:20', 0], ['10:40', 0], ['10:41', 41], ['11:00', 60]]) {
    const result = lessonBreaks([{ id: 'a', start: '09:00', end: '10:00' }, { id: 'b', start, end: '12:00' }])
    assert.equal(result.get('b')?.minutes || 0, expected)
  }
  assert.equal(lessonBreaks([]).size, 0)
  assert.equal(lessonBreaks([{ id: 'a', start: '09:00', end: '10:00' }]).size, 0)
})

test('Перекрытия, одинаковое время и неупорядоченные пары не создают ложных окон', () => {
  const lessons = [
    { id: 'next', start: '13:00', end: '14:00' },
    { id: 'outer', start: '09:00', end: '12:00' },
    { id: 'inner', start: '09:00', end: '10:00' },
    { id: 'touch', start: '10:00', end: '11:00' },
  ]
  const before = structuredClone(lessons)
  assert.deepEqual([...lessonBreaks(lessons)], [['next', { start: '12:00', end: '13:00', minutes: 60 }]])
  assert.deepEqual(lessons, before)
})
