import { test } from 'node:test'
import assert from 'node:assert/strict'
import { milliseconds } from '../design/motion.ts'

test('Длительности CSS одинаковы до и после сокращения сборщиком', () => {
  for (const [source, built, expected] of [['220ms', '.22s', 220], ['320ms', '.32s', 320], ['550ms', '.55s', 550], ['1000ms', '1s', 1000]]) {
    assert.equal(milliseconds(source), expected)
    assert.equal(milliseconds(` ${built} `), expected)
  }
  assert.equal(milliseconds(''), 0)
  assert.equal(milliseconds('0s'), 0)
})
