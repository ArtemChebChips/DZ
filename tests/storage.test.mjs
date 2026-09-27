import test from 'node:test'
import assert from 'node:assert/strict'
import { freshNotebook, readNotebook, persistNotebook, validateNotebook, validDate, STORAGE_KEY } from '../design/storage.ts'
function memory(initial = {}) {
  const values = new Map(Object.entries(initial))
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values }
}
test('Чёрная и прежние темы читаются без миграции и изменений заданий', () => {
  const task = { id: 'saved', title: 'Сохранённый срок', subjectId: 'phys', due: '2026-09-28', done: false, lessonId: 'pn-5', kind: 'lab' }
  for (const theme of ['light', 'dark', 'black', 'system']) {
    const data = { ...freshNotebook(), theme, tasks: [task] }
    const storage = memory({ [STORAGE_KEY]: JSON.stringify(data) })
    assert.deepEqual(readNotebook(storage), data)
    persistNotebook(storage, { ...data, theme: 'black' })
    assert.deepEqual(readNotebook(storage).tasks, [task])
  }
})
test('Задание, контекст семинара, тема и свёрнутые дни переживают повторное чтение', () => {
  const storage = memory({ 'dz:data': 'legacy untouched' })
  const data = freshNotebook()
  data.tasks.push({ id: '1', title: 'Семинар', subjectId: 'phys', due: '2026-09-28', done: true, kind: 'seminar', lessonId: 'pn-4' })
  data.theme = 'dark'; data.collapsed = ['2026-09-28']
  persistNotebook(storage, data)
  assert.deepEqual(readNotebook(storage), data)
  assert.equal(storage.getItem('dz:data'), 'legacy untouched')
})
test('Первый запуск пустой, данные прежней версии не импортируются молча', () => {
  assert.deepEqual(readNotebook(memory({ 'dz:data': '{"tasks":[1]}' })), freshNotebook())
})
test('Повреждённые и неподдерживаемые данные отклоняются без перезаписи', () => {
  for (const raw of ['{', '{"version":999}', JSON.stringify({ ...freshNotebook(), tasks: [null] })]) {
    const storage = memory({ [STORAGE_KEY]: raw })
    assert.throws(() => readNotebook(storage))
    assert.equal(storage.getItem(STORAGE_KEY), raw)
  }
})
test('Невозможные даты и дубликаты идентификаторов не принимаются', () => {
  assert.equal(validDate('2026-02-29'), false)
  assert.equal(validDate('2028-02-29'), true)
  assert.equal(validDate('2026-13-01'), false)
  const task = { id: 'same', title: 'Задание', subjectId: '', due: '2026-09-20', done: false }
  assert.equal(validateNotebook({ ...freshNotebook(), tasks: [task, task] }), false)
})
test('Отказ доступа и нехватка места не скрываются', () => {
  assert.throws(() => readNotebook({ getItem() { throw new Error('denied') } }), /denied/)
  assert.throws(() => persistNotebook({ setItem() { throw new Error('quota') } }, freshNotebook()), /quota/)
})
test('Старая запись без скорости читается без миграции; все скорости сохраняются вместе с заданиями', () => {
  const original = { ...freshNotebook(), tasks: [{ id: 'old', title: 'Не менять', subjectId: 'phys', due: '2026-09-28', done: false, kind: 'lab', lessonId: 'pn-5' }] }
  const raw = JSON.stringify(original)
  const storage = memory({ [STORAGE_KEY]: raw, 'dz:data': 'legacy' })
  const loaded = readNotebook(storage)
  assert.equal(loaded.animationSpeed ?? 'normal', 'normal')
  assert.equal(storage.getItem(STORAGE_KEY), raw)
  for (const animationSpeed of ['fast', 'normal', 'smooth']) {
    persistNotebook(storage, { ...loaded, animationSpeed })
    const restored = readNotebook(storage)
    assert.equal(restored.animationSpeed, animationSpeed)
    assert.deepEqual(restored.tasks, original.tasks)
  }
  assert.equal(storage.getItem('dz:data'), 'legacy')
})
test('Неизвестная скорость отклоняется без перезаписи данных', () => {
  const raw = JSON.stringify({ ...freshNotebook(), animationSpeed: 'broken' })
  const storage = memory({ [STORAGE_KEY]: raw })
  assert.throws(() => readNotebook(storage))
  assert.equal(storage.getItem(STORAGE_KEY), raw)
})
