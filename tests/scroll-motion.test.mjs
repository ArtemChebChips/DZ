import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollStep, scrollReleaseVelocity } from '../design/scroll-motion.ts'
import { swipeFollow } from '../design/swipe.ts'

test('Инерция списка одинакова на 60, 90 и 120 Гц и постепенно затухает', () => {
  const run = hz => {
    let velocity = 2.5, distance = 0
    for (let i = 0; i < hz * 2; i++) {
      const next = scrollStep(velocity, 1000 / hz)
      distance += next.distance; velocity = next.velocity
    }
    return { distance, velocity }
  }
  const reference = run(60)
  for (const hz of [90, 120]) {
    assert.ok(Math.abs(run(hz).distance - reference.distance) < 1e-8)
    assert.ok(run(hz).velocity < .006)
  }
  assert.ok(reference.distance < 800 && reference.distance > 790)
  assert.ok(scrollStep(2.5, 300).velocity > .9 && scrollStep(2.5, 300).velocity < 1.1)
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


test('Редкие события сохраняют инерцию; удержание пальца останавливает её', () => {
  const samples = [{ y: 500, time: 0 }, { y: 380, time: 120 }]
  assert.ok(scrollReleaseVelocity(samples, 150) > .8)
  assert.equal(scrollReleaseVelocity(samples, 310), 0)
  assert.equal(scrollReleaseVelocity([], 150), 0)
  assert.equal(scrollReleaseVelocity([samples[0]], 150), 0)
  assert.ok(scrollReleaseVelocity([{ y: 100, time: 0 }, { y: 200, time: 50 }], 60) < 0)
  assert.equal(scrollReleaseVelocity([{ y: 1000, time: 0 }, { y: 0, time: 10 }], 10), 2.5)
})
