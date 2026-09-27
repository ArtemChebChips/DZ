import test from 'node:test'
import assert from 'node:assert/strict'
import { daySwipeTarget, swipeFollow, swipeSettleDuration, swipeSettleProgress } from '../design/swipe.ts'

test('Сглаживание одинаково на 60/120 Гц, без перелёта при развороте', () => {
  const at60 = swipeFollow(0, -200, 1000 / 60)
  const at120 = swipeFollow(swipeFollow(0, -200, 1000 / 120), -200, 1000 / 120)
  assert.ok(Math.abs(at60 - at120) < 1e-10)
  assert.ok(at60 < 0 && at60 > -200)
  const reversed = swipeFollow(at60, 100, 1000 / 60)
  assert.ok(reversed > at60 && reversed < 100)
  assert.ok(Math.abs(swipeFollow(0, 200, 100) - 200) < 4)
  assert.equal(swipeFollow(10, 200, 0), 10)
})

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
test('Доведение свайпа занимает не больше 180 мс даже при плавной настройке', () => {
  for (const duration of [220, 320, 550]) {
    for (const distance of [5, 195, 390]) {
      const settle = swipeSettleDuration(distance, 390, duration)
      assert.ok(settle >= 100 && settle <= 180)
    }
  }
  assert.ok(swipeSettleDuration(5, 390, 320) < swipeSettleDuration(195, 390, 320))
  assert.equal(swipeSettleDuration(195, 390, 0), 0)
  assert.equal(swipeSettleDuration(195, 0, 320), 0)
})
