import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollStep } from '../design/scroll-motion.ts'
import { swipeFollow } from '../design/swipe.ts'

test('Инерция списка одинакова на 60, 90 и 120 Гц и быстро затухает', () => {
  const run = hz => {
    let velocity = 2.5, distance = 0
    for (let i = 0; i < hz; i++) {
      const next = scrollStep(velocity, 1000 / hz)
      distance += next.distance; velocity = next.velocity
    }
    return { distance, velocity }
  }
  const reference = run(60)
  for (const hz of [90, 120]) {
    assert.ok(Math.abs(run(hz).distance - reference.distance) < 1e-8)
    assert.ok(run(hz).velocity < .003)
  }
  assert.ok(reference.distance < 350 && reference.distance > 340)
  assert.ok(scrollStep(2.5, 300).velocity < .3)
  assert.equal(scrollStep(0, 16).distance, 0)
  assert.ok(scrollStep(-1, 16).distance < 0)
})

test('Сглаживание свайпа одинаково за 100 мс на 60, 90 и 120 Гц', () => {
  const run = hz => {
    let offset = 0
    for (let i = 0; i < hz / 10; i++) offset = swipeFollow(offset, 200, 1000 / hz)
    return offset
  }
  assert.ok(Math.abs(run(60) - run(90)) < 1e-8)
  assert.ok(Math.abs(run(60) - run(120)) < 1e-8)
})
