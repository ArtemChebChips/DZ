import test from 'node:test'
import assert from 'node:assert/strict'
import { daySwipeTarget } from '../design/swipe.ts'

test('Медленное перелистывание требует заметной части ширины страницы', () => {
  assert.equal(daySwipeTarget(-160, 390, 0), 1)
  assert.equal(daySwipeTarget(160, 390, 0), -1)
  assert.equal(daySwipeTarget(-80, 390, 0), 0)
  assert.equal(daySwipeTarget(-160, 850, 0), 0)
  assert.equal(daySwipeTarget(-300, 850, 0), 1)
})
test('Короткий взмах перелистывает, дрожание пальца — нет', () => {
  assert.equal(daySwipeTarget(-70, 390, -.6), 1)
  assert.equal(daySwipeTarget(70, 390, .6), -1)
  assert.equal(daySwipeTarget(-20, 390, -1), 0)
})
test('Возврат к началу или движение назад отменяет даже глубокое перелистывание', () => {
  assert.equal(daySwipeTarget(-15, 390, 0), 0)
  assert.equal(daySwipeTarget(-210, 390, .5), 0)
  assert.equal(daySwipeTarget(210, 390, -.5), 0)
  assert.equal(daySwipeTarget(0, 0, 0), 0)
})
