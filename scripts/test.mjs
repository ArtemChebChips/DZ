import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'

// Node читает TypeScript напрямую. Дополняем только локальные импорты без расширения.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL)
    if (existsSync(candidate)) return nextResolve(candidate.href, context)
  }
  return nextResolve(specifier, context)
} })
const dates = await import('../src/lib/dates.ts')
const week = await import('../src/lib/week.ts')
const { buildBuckets } = await import('../src/lib/tasks.ts')
const { parseBackup } = await import('../src/lib/backup.ts')
const { DEFAULT_LESSONS: lessons, DEFAULT_SUBJECTS: subjects, ANCHOR_MONDAY: anchor } = await import('../src/data/schedule.ts')
const task = (id, due, done = false, createdAt = id) => ({ id, subjectId: 'phys', title: 'Пример задания', due, done, createdAt, updatedAt: createdAt })
const data = () => ({ version: 2, subjects, lessons, tasks: [task('a', '2026-09-08')], settings: { anchorMonday: anchor } })

test('Календарные даты: месяц, високосный год и годовая граница', () => {
  assert.equal(dates.addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(dates.addDays('2024-02-28', 1), '2024-02-29')
  assert.equal(dates.mondayOf('2026-09-13'), '2026-09-07')
  assert.equal(dates.diffDays('2026-08-31', '2026-09-14'), 14)
})
test('Чётность от якоря, до якоря и через Новый год', () => {
  assert.equal(week.parityOf(anchor, anchor), 'num')
  assert.equal(week.parityOf('2026-09-07', anchor), 'denom')
  assert.equal(week.parityOf('2026-09-14', anchor), 'num')
  assert.equal(week.parityOf('2026-08-24', anchor), 'denom')
  assert.notEqual(week.parityOf('2025-12-29', anchor), week.parityOf('2026-01-05', anchor))
})
test('Настоящее расписание: числитель, знаменатель, воскресенье', () => {
  assert.equal(subjects.length, 11)
  assert.equal(lessons.length, 28)
  const num = week.lessonsOn('2026-09-14', lessons, anchor)
  const denom = week.lessonsOn('2026-09-07', lessons, anchor)
  assert.equal(num.filter(l => l.subjectId === 'phys' && l.kind === 'lab').length, 2)
  assert.equal(denom.filter(l => l.subjectId === 'phys' && l.kind === 'lab').length, 0)
  assert.equal(denom.filter(l => l.subjectId === 'matchem').length, 1)
  assert.deepEqual(week.lessonsOn('2026-09-13', lessons, anchor), [])
})
test('Следующая пара учитывает две недели и не дублирует дату', () => {
  assert.deepEqual(week.nextLessonDates('it', '2026-09-07', lessons, anchor), ['2026-09-16', '2026-09-30'])
  assert.deepEqual(week.nextLessonDates('innov', '2026-09-08', lessons, anchor), ['2026-09-15', '2026-09-22'])
  assert.deepEqual(week.nextLessonDates('theory', '2026-09-07', lessons, anchor, 3), ['2026-09-09', '2026-09-19', '2026-09-23'])
  assert.deepEqual(week.nextLessonDates('missing', '2026-09-07', lessons, anchor), [])
})
test('Четыре группы дедлайнов и воскресный переход', () => {
  const tasks = [task('d', '2026-10-02'), task('b', '2026-09-09'), task('a', '2026-09-04'), task('c', '2026-09-16'), task('done', '2026-09-08', true)]
  const result = buildBuckets(tasks, '2026-09-06')
  assert.deepEqual(result.map(b => b.key), ['overdue', 'this', 'next', 'later'])
  assert.deepEqual(result.map(b => b.days[0].tasks[0].id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(result.map(b => b.count), [1, 1, 1, 1])
})
test('Задания одного дня идут в порядке добавления', () => {
  const result = buildBuckets([task('b', '2026-09-08', false, '2026-09-07T10:00:00Z'), task('a', '2026-09-08', false, '2026-09-07T09:00:00Z')], '2026-09-07')
  assert.deepEqual(result[0].days[0].tasks.map(t => t.id), ['a', 'b'])
})
test('Импорт принимает резервную копию Claude версии 2', () => {
  const exported = JSON.stringify(data())
  assert.deepEqual(parseBackup(exported), JSON.parse(exported))
})
test('Импорт отклоняет чужие, неполные и повреждённые данные', () => {
  for (const invalid of ['{}', 'null', '{', JSON.stringify({ ...data(), tasks: [{ ...task('a', '2026-02-30') }] }), JSON.stringify({ ...data(), tasks: [{ ...task('a', '2026-09-08'), subjectId: 'missing' }] })]) {
    assert.throws(() => parseBackup(invalid))
  }
})
const storage = new Map([['dz:data', 'данные прежней версии'], ['dz:theme', 'night']])
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } })
const store = await import('../src/store.ts')
test('Версии изолированы: запись не затрагивает старые задания и тему', () => {
  const created = store.addTask({ subjectId: 'phys', title: '  Проверить задачу  ', due: '2026-09-08' })
  assert.equal(created.title, 'Проверить задачу')
  assert.equal(JSON.parse(storage.get('dz:codex:data')).tasks.length, 1)
  assert.equal(storage.get('dz:data'), 'данные прежней версии')
  assert.equal(storage.get('dz:theme'), 'night')
  store.toggleTask(created.id)
  assert.equal(JSON.parse(store.exportJSON()).tasks[0].done, true)
  store.toggleTask(created.id)
  assert.equal(JSON.parse(store.exportJSON()).tasks[0].done, false)
})
test('Удаление пары не меняет задание и дедлайн; экспорт восстанавливает данные', () => {
  const before = JSON.parse(store.exportJSON()).tasks
  const lesson = store.addLesson({ subjectId: 'phys', weekday: 1, start: '10:00', end: '11:00', parity: 'both', kind: 'seminar' })
  store.deleteLesson(lesson.id)
  assert.deepEqual(JSON.parse(store.exportJSON()).tasks, before)
  const backup = store.exportJSON()
  store.clearTasks()
  store.importJSON(backup)
  assert.equal(store.exportJSON(), backup)
  assert.throws(() => store.importJSON('{}'))
  assert.equal(store.exportJSON(), backup)
})
