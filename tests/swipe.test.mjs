import test from 'node:test'
import assert from 'node:assert/strict'
import { daySwipeTarget, swipeSettleDuration, swipeSettleProgress } from '../design/swipe.ts'

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
test('Возврат к началу отменяет свайп; небольшая обратная скорость не отменяет почти завершённый', () => {
  assert.equal(daySwipeTarget(-15, 390, 0), 0)
  assert.equal(daySwipeTarget(-100, 390, .5), 0)
  assert.equal(daySwipeTarget(-310, 390, .5), 1)
  assert.equal(daySwipeTarget(310, 390, -.5), -1)
  assert.equal(daySwipeTarget(0, 0, 0), 0)
})
test('Доведение непрерывно, без выхода за край; скорость к концу стремится к нулю', () => {
  for (const slope of [0, .5, 1.2]) {
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
test('Полстраницы доводится плавнее прежних 320 мс, с учётом выбранной скорости и reduced motion', () => {
  const normal = swipeSettleDuration(195, 390, 320)
  assert.ok(normal > 380 && normal < 450)
  assert.ok(swipeSettleDuration(195, 390, 220) < normal)
  assert.ok(swipeSettleDuration(195, 390, 460) > normal)
  assert.equal(swipeSettleDuration(195, 390, 0), 0)
})
