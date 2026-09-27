import test from 'node:test'
import assert from 'node:assert/strict'
import { isCurrentInterval } from '../design/current-interval.ts'
import { lessonBreaks } from '../design/breaks.ts'
import { DEFAULT_LESSONS } from '../src/data/schedule.ts'

test('Подсветка только сегодня: начало включено, конец исключён', () => {
  const interval = { start: '14:05', end: '15:35' }
  const active = (minute, date = '2026-09-21') => isCurrentInterval(date, '2026-09-21', minute, interval)
  assert.equal(active(14 * 60 + 4), false)
  assert.equal(active(14 * 60 + 5), true)
  assert.equal(active(15 * 60 + 34), true)
  assert.equal(active(15 * 60 + 35), false)
  assert.equal(active(14 * 60 + 30, '2026-09-22'), false)
  assert.equal(active(14 * 60 + 30, '2026-09-20'), false)
  assert.equal(active(0), false)
})

test('Реальные интервалы обеих недель и длинные перерывы не пересекаются на границе', () => {
  for (const parity of ['num', 'denom']) {
    const lessons = DEFAULT_LESSONS.filter(l => l.weekday === 1 && (l.parity === parity || l.parity === 'both'))
    const breaks = lessonBreaks(lessons)
    for (const lesson of lessons) {
      const minute = Number(lesson.start.slice(0, 2)) * 60 + Number(lesson.start.slice(3))
      assert.equal(isCurrentInterval('today', 'today', minute, lesson), true)
      const pause = breaks.get(lesson.id)
      if (pause) {
        assert.equal(isCurrentInterval('today', 'today', minute, pause), false)
        assert.equal(isCurrentInterval('today', 'today', minute - 1, pause), true)
      }
    }
  }
})

test('Перекрывающиеся пары отмечаются обе; пустой день не получает подсветку', () => {
  const lessons = [{ start: '10:00', end: '12:00' }, { start: '11:00', end: '13:00' }]
  const active = list => list.filter(l => isCurrentInterval('today', 'today', 11 * 60 + 30, l))
  assert.equal(active(lessons).length, 2)
  assert.deepEqual(active([]), [])
})
