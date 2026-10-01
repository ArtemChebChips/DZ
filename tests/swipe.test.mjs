import test from 'node:test'
import assert from 'node:assert/strict'
import { daySwipeTarget, gestureAxis, swipeReleaseVelocity, swipeSettleDuration, swipeSettleProgress } from '../design/swipe.ts'

test('Прокрутка и день используют одинаковое распознавание направления', () => {
  assert.equal(gestureAxis(9, 0), null)
  assert.equal(gestureAxis(10, 0), 'x')
  assert.equal(gestureAxis(0, -10), 'y')
  assert.equal(gestureAxis(15, 15), 'y')
  assert.equal(gestureAxis(-20, 10), 'x')
})

test('Медленное перелистывание требует около пятой части страницы, а не её трети', () => {
  assert.equal(daySwipeTarget(-160, 390, 0), 1)
  assert.equal(daySwipeTarget(160, 390, 0), -1)
  assert.equal(daySwipeTarget(-80, 390, 0), 0)
  assert.equal(daySwipeTarget(-90, 390, 0), 1)
  assert.equal(daySwipeTarget(-160, 850, 0), 1)
  assert.equal(daySwipeTarget(-100, 850, 0), 0)
  assert.equal(daySwipeTarget(-300, 850, 0), 1)
})
test('Короткий взмах перелистывает, дрожание пальца — нет', () => {
  assert.equal(daySwipeTarget(-70, 390, -.6), 1)
  assert.equal(daySwipeTarget(70, 390, .6), -1)
  assert.equal(daySwipeTarget(-20, 390, -1), 0)
  assert.equal(daySwipeTarget(-24, 390, -.6), 1)
  assert.equal(daySwipeTarget(24, 390, .6), -1)
  assert.equal(daySwipeTarget(-24, 390, -.1), 0)
})
test('Возврат к началу отменяет свайп; небольшая обратная скорость не отменяет почти завершённый', () => {
  assert.equal(daySwipeTarget(-15, 390, 0), 0)
  assert.equal(daySwipeTarget(-100, 390, .5), 0)
  assert.equal(daySwipeTarget(-310, 390, .5), 1)
  assert.equal(daySwipeTarget(310, 390, -.5), -1)
  assert.equal(daySwipeTarget(0, 0, 0), 0)
  assert.equal(daySwipeTarget(-200, 390, 2), 0)
})
test('Скорость короткого взмаха сохраняется при редких touchmove, пауза её гасит', () => {
  const samples = [{ x: 100, time: 0 }, { x: 76, time: 40 }]
  assert.equal(swipeReleaseVelocity(samples, 76, 40), -.6)
  assert.ok(swipeReleaseVelocity(samples, 76, 50) < -.45)
  assert.ok(Math.abs(swipeReleaseVelocity(samples, 76, 140)) < .12)
  assert.equal(swipeReleaseVelocity(samples, 76, 200), 0)
  assert.equal(swipeReleaseVelocity([], 76, 40), 0)
  assert.equal(swipeReleaseVelocity([{ x: 100, time: 0 }], 100, 10), 0)
  assert.equal(swipeReleaseVelocity([{ x: 100, time: 0 }], 70, 30), -1)
})
test('Решение учитывает последние движения и разворот, а не всю длинную историю', () => {
  const accelerated = [{ x: 0, time: 0 }, { x: 5, time: 250 }, { x: 8, time: 300 }, { x: 32, time: 330 }, { x: 62, time: 360 }]
  assert.ok(swipeReleaseVelocity(accelerated, 62, 360) > .65)
  const returning = [{ x: 200, time: 0 }, { x: 100, time: 100 }, { x: 130, time: 130 }, { x: 170, time: 160 }]
  assert.ok(swipeReleaseVelocity(returning, 170, 160) > .6)
  assert.equal(swipeReleaseVelocity([{ x: 100, time: 0 }, { x: 0, time: 10 }], 0, 10), -3)
})
test('Скорость одинакового движения не зависит от частоты touchmove', () => {
  for (const hz of [30, 60, 90, 120]) {
    const samples = Array.from({ length: hz / 10 + 1 }, (_, i) => ({ x: -i * 1000 / hz, time: i * 1000 / hz }))
    const last = samples.at(-1)
    assert.ok(Math.abs(swipeReleaseVelocity(samples, last.x, last.time) + 1) < 1e-10)
  }
})
test('Доведение непрерывно, без выхода за край; скорость к концу стремится к нулю', () => {
  for (const slope of [0, .5, 1.2, 2, 3]) {
    let previous = 0
    for (let i = 0; i <= 100; i++) {
      const value = swipeSettleProgress(i / 100, slope)
      assert.ok(value >= previous && value <= 1)
      previous = value
    }
    assert.equal(swipeSettleProgress(0, slope), 0)
    assert.equal(swipeSettleProgress(1, slope), 1)
    assert.ok(1 - swipeSettleProgress(.99, slope) < .001)
  }
  assert.ok(swipeSettleProgress(.1, 0) < .04, 'спокойный старт после неподвижного пальца')
})
test('Доведение сокращается для малого остатка; целая страница сохраняет достаточно кадров для плавности', () => {
  for (const duration of [220, 320, 550]) {
    for (const distance of [5, 195, 390]) {
      const settle = swipeSettleDuration(distance, 390, duration)
      assert.ok(settle >= 60 && settle <= 190)
    }
  }
  assert.ok(swipeSettleDuration(5, 390, 320) < swipeSettleDuration(195, 390, 320))
  assert.equal(swipeSettleDuration(195, 390, 0), 0)
  assert.equal(swipeSettleDuration(195, 0, 320), 0)
  assert.equal(swipeSettleDuration(0, 390, 320), 0)
  assert.equal(swipeSettleDuration(390, 390, 260), 169)
  assert.equal(swipeSettleDuration(390, 390, 100), 140)
  assert.equal(swipeSettleDuration(390, 390, 550), 190)
})
