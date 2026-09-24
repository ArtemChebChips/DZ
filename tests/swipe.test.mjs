import test from 'node:test'
import assert from 'node:assert/strict'
import { swipeDay } from '../design/swipe.ts'
test('Свайп дня требует длины и горизонтального преобладания', () => {
  assert.equal(swipeDay(-80, 12), 1)
  assert.equal(swipeDay(80, -12), -1)
  for (const [x, y] of [[20, 0], [59, 0], [80, 70], [0, 120], [60, 40]]) assert.equal(swipeDay(x, y), 0)
})
