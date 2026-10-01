import test from 'node:test'
import assert from 'node:assert/strict'
import { applySync, startSync, trackChanges, resolveConflict, endpointURL, readSyncReply } from '../design/sync-model.ts'
import { freshNotebook, validTask, validateNotebook, persistNotebook, readNotebook, importTasks, STORAGE_KEY } from '../design/storage.ts'
import { bindAccount } from '../design/use-cloud.ts'

const endpoint = 'https://dz.example.com/api'
const account = { id: 'owner', username: 'artem' }
const task = { id: 'one', title: 'Э-104, стр. 115, №35–38', subjectId: 'phys', due: '2026-10-05', done: false, kind: 'lab', lessonId: 'pn-3' }
let sequence = 0
const uuid = () => `test-${++sequence}`
const connected = (tasks = [task]) => ({ ...freshNotebook(), tasks, sync: startSync(tasks, account, endpoint, uuid) })
const reply = (overrides = {}) => ({ version: 1, cursor: 0, records: [], accepted: [], conflicts: [], ...overrides })
function memory() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values }
}

test('Первая привязка сохраняет Notebook v1, локальную копию, ID и дедлайн; повтор безопасен', () => {
  const book = { ...freshNotebook(), tasks: [task], theme: 'dark', collapsed: ['2026-10-05'] }
  const storage = memory(), session = { endpoint, user: account, token: 'private-token' }
  persistNotebook(storage, book)
  const next = bindAccount(storage, book, session)
  assert.deepEqual(JSON.parse(storage.getItem('dz-next:before-account:v1')), book)
  assert.deepEqual(next.tasks, book.tasks)
  persistNotebook(storage, next)
  assert.deepEqual(readNotebook(storage), next)
  assert.strictEqual(bindAccount(storage, next, session), next)
  assert.equal(storage.getItem(STORAGE_KEY).includes('private-token'), false)
})

test('Пустой сервер не очищает старые задания; очередь и задачи сохраняются атомарно', () => {
  const book = connected()
  assert.strictEqual(applySync(book, [], reply(), uuid), book)
  const next = trackChanges(book, { ...book, tasks: [{ ...task, done: true }] }, uuid)
  const storage = memory(); persistNotebook(storage, next)
  const restored = readNotebook(storage)
  assert.equal(restored.tasks[0].done, true)
  assert.equal(restored.sync.pending.length, 1)
  assert.equal(restored.sync.pending[0].task.done, true)
  assert.equal(restored.tasks[0].due, task.due)
})

test('Устаревшая вкладка не перезаписывает чужие изменения и удалённое хранилище', () => {
  const storage = memory(), book = connected()
  const raw = persistNotebook(storage, book, null)
  const other = trackChanges(book, { ...book, tasks: [{ ...task, title: 'Из другой вкладки' }] }, uuid)
  const otherRaw = persistNotebook(storage, other, raw)
  assert.throws(() => persistNotebook(storage, { ...book, theme: 'black' }, raw), /другой вкладке/)
  assert.equal(storage.getItem(STORAGE_KEY), otherRaw)
  storage.values.delete(STORAGE_KEY)
  assert.throws(() => persistNotebook(storage, book, otherRaw), /другой вкладке/)
  assert.equal(storage.getItem(STORAGE_KEY), null)
})

test('Правка во время отправки не затирается ответом и отправляется с новой ревизией', () => {
  const book = connected(), sent = book.sync.pending
  const latest = trackChanges(book, { ...book, tasks: [{ ...task, title: 'Последняя правка' }] }, uuid)
  const result = applySync(latest, sent, reply({ cursor: 1, accepted: [{ operationId: sent[0].id, taskId: task.id, revision: 1 }], records: [{ id: task.id, revision: 1, task }] }), uuid)
  assert.equal(result.tasks[0].title, 'Последняя правка')
  assert.equal(result.sync.pending[0].baseRevision, 1)
  assert.notEqual(result.sync.pending[0].id, latest.sync.pending[0].id)
})

test('Конфликт сохраняет обе версии; явный выбор локальной версии создаёт новую операцию', () => {
  const book = connected(), sent = book.sync.pending, remote = { id: task.id, revision: 3, task: { ...task, title: 'На другом устройстве' } }
  const conflicted = applySync(book, sent, reply({ cursor: 3, conflicts: [{ operationId: sent[0].id, record: remote }], records: [remote] }), uuid)
  assert.equal(conflicted.tasks[0].title, task.title)
  assert.equal(conflicted.sync.pending.length, 0)
  assert.equal(conflicted.sync.conflicts[0].remote.task.title, 'На другом устройстве')
  const edited = trackChanges(conflicted, { ...conflicted, tasks: [{ ...task, title: 'Уточнённая локальная версия' }] }, uuid)
  assert.equal(edited.sync.pending.length, 0)
  const resolved = resolveConflict(edited, task.id, 'local', uuid)
  assert.equal(resolved.sync.pending[0].baseRevision, 3)
  assert.equal(resolved.sync.pending[0].task.title, 'Уточнённая локальная версия')
  assert.equal(resolved.sync.conflicts.length, 0)
  assert.equal(resolveConflict(conflicted, task.id, 'server', uuid).tasks[0].title, 'На другом устройстве')
})

test('Конфликт удаления не воскрешает локальную запись; выбор сервера поддерживает удаление', () => {
  let book = connected()
  book = { ...book, sync: { ...book.sync, pending: [], revisions: { one: 1 }, cursor: 1 } }
  const deleted = trackChanges(book, { ...book, tasks: [] }, uuid)
  const remote = { id: task.id, revision: 2, task: { ...task, done: true } }
  const conflicted = applySync(deleted, deleted.sync.pending, reply({ cursor: 2, conflicts: [{ operationId: deleted.sync.pending[0].id, record: remote }], records: [remote] }), uuid)
  assert.equal(conflicted.sync.conflicts[0].local, null)
  assert.deepEqual(conflicted.tasks, [])
  assert.equal(resolveConflict(conflicted, task.id, 'local', uuid).sync.pending[0].task, null)
  const tombstone = applySync(book, [], reply({ cursor: 2, records: [{ id: task.id, revision: 2, task: null }] }), uuid)
  assert.deepEqual(tombstone.tasks, [])
  assert.equal(tombstone.sync.revisions.one, 2)
})

test('Смена аккаунта отделяет локальные задания и возвращает очередь прежнего пользователя', () => {
  const storage = memory(), book = connected()
  const second = { endpoint, user: { id: 'friend', username: 'friend' }, token: 'secret' }
  const switched = bindAccount(storage, book, second)
  assert.deepEqual(switched.tasks, [])
  assert.deepEqual(switched.sync.pending, [])
  assert.equal(switched.sync.accountId, 'friend')
  const restored = bindAccount(storage, switched, { endpoint, user: account, token: 'new' })
  assert.deepEqual(restored.tasks, book.tasks)
  assert.deepEqual(restored.sync.pending, book.sync.pending)
})

test('Ошибка сохранения копии прерывает привязку без изменения исходных данных', () => {
  const book = connected()
  assert.throws(() => bindAccount({ getItem() { return null }, setItem() { throw new Error('quota') } }, book, { endpoint, user: { id: 'other' }, token: '' }), /quota/)
  assert.deepEqual(book.tasks, [task])
})

test('Импорт сохраняет разные версии, повтор не дублирует их и не переносит чужой аккаунт', () => {
  const book = connected(), raw = JSON.stringify({ ...connected([{ ...task, title: 'Из файла' }]), sync: { token: 'foreign', accountId: 'foreign' } })
  const imported = importTasks(book, raw, uuid)
  assert.equal(imported.tasks.length, 2)
  assert.notEqual(imported.tasks[1].id, task.id)
  assert.strictEqual(imported.sync, book.sync)
  assert.deepEqual(importTasks(imported, raw, uuid), imported)
  const queued = trackChanges(book, imported, uuid)
  assert.equal(queued.sync.pending.length, 2)
  assert.throws(() => importTasks(book, '{'))
  assert.throws(() => importTasks(book, JSON.stringify({ ...freshNotebook(), tasks: [null] })))
})

test('Некорректные ответы и метаданные отклоняются; откат серверного курсора не принимается', () => {
  assert.equal(validateNotebook({ ...connected(), sync: { ...connected().sync, cursor: -1 } }), false)
  assert.throws(() => readSyncReply(reply({ cursor: 1, records: [{ id: task.id, revision: 2, task }] }), validTask))
  assert.throws(() => readSyncReply(reply({ records: [{ id: task.id, revision: 1, task: { ...task, due: '2026-02-30' } }] }), validTask))
  const book = connected(); book.sync.cursor = 10
  assert.throws(() => applySync(book, [], reply({ cursor: 9 }), uuid))
  assert.throws(() => applySync(connected(), [], reply({ accepted: [{ operationId: 'unknown', taskId: task.id, revision: 1 }] }), uuid))
})

test('Служебные имена ID работают как обычные задания', () => {
  for (const taskId of ['__proto__', 'constructor', 'toString']) {
    const book = connected([]), special = { ...task, id: taskId }
    const edited = trackChanges(book, { ...book, tasks: [special] }, uuid)
    assert.equal(edited.sync.pending[0].baseRevision, 0)
    const result = applySync(edited, edited.sync.pending, reply({ cursor: 1, accepted: [{ operationId: edited.sync.pending[0].id, taskId, revision: 1 }], records: [{ id: taskId, revision: 1, task: special }] }), uuid)
    assert.equal(result.sync.revisions[taskId], 1)
    assert.equal(validateNotebook(result), true)
  }
})

test('Адрес сервера требует HTTPS, без пароля и параметров; HTTP только для loopback', () => {
  assert.equal(endpointURL('https://dz.example.com'), endpoint)
  assert.equal(endpointURL('http://127.0.0.1:4185/api/'), 'http://127.0.0.1:4185/api')
  for (const address of ['http://example.com', 'https://user:password@example.com', 'https://example.com?token=x', 'javascript:alert(1)', 'https://example.com/other']) assert.throws(() => endpointURL(address))
})
