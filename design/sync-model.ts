import type { DemoTask } from './data'

export type Change = { id: string; taskId: string; baseRevision: number; task: DemoTask | null }
export type RemoteRecord = { id: string; revision: number; task: DemoTask | null }
export type Conflict = { taskId: string; local: DemoTask | null; remote: RemoteRecord }
export type SyncState = {
  version: 1; accountId: string; username: string; endpoint: string; cursor: number
  revisions: Record<string, number>; pending: Change[]; conflicts: Conflict[]
}
export type SyncReply = {
  version: 1; cursor: number; records: RemoteRecord[]
  accepted: { operationId: string; taskId: string; revision: number }[]
  conflicts: { operationId: string; record: RemoteRecord }[]
}
type Book = { tasks: DemoTask[]; sync?: SyncState }
const revision = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256

// Порядок полей не влияет на сравнение импортированных и серверных записей.
export function sameTask(a: DemoTask | null, b: DemoTask | null) {
  if (!a || !b) return a === b
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])] as (keyof DemoTask)[]
  return keys.every(key => a[key] === b[key])
}

export function endpointURL(value: string) {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash || !['/', '/api', '/api/'].includes(url.pathname)) throw new Error('Укажи адрес сервера без параметров.')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Для сервера нужен HTTPS.')
  return `${url.origin}/api`
}

export function validSync(value: unknown, taskValid: (task: unknown) => boolean): value is SyncState {
  if (!value || typeof value !== 'object') return false
  const s = value as SyncState
  try { if (endpointURL(s.endpoint) !== s.endpoint) return false } catch { return false }
  const record = (r: RemoteRecord) => r && id(r.id) && revision(r.revision) && (r.task === null || (taskValid(r.task) && r.task.id === r.id))
  return s.version === 1 && id(s.accountId) && id(s.username) && revision(s.cursor) && Boolean(s.revisions) && typeof s.revisions === 'object' && !Array.isArray(s.revisions) && Object.entries(s.revisions).every(([key, n]) => id(key) && revision(n)) &&
    Array.isArray(s.pending) && new Set(s.pending.map(p => p?.taskId)).size === s.pending.length && new Set(s.pending.map(p => p?.id)).size === s.pending.length &&
    s.pending.every(p => p && id(p.id) && id(p.taskId) && revision(p.baseRevision) && (p.task === null || (taskValid(p.task) && p.task.id === p.taskId))) &&
    Array.isArray(s.conflicts) && new Set(s.conflicts.map(c => c?.taskId)).size === s.conflicts.length && s.conflicts.every(c => c && id(c.taskId) && (c.local === null || (taskValid(c.local) && c.local.id === c.taskId)) && record(c.remote) && c.remote.id === c.taskId) &&
    !s.pending.some(p => s.conflicts.some(c => c.taskId === p.taskId))
}

export function startSync(tasks: DemoTask[], account: { id: string; username: string }, endpoint: string, uuid = () => crypto.randomUUID()): SyncState {
  return { version: 1, accountId: account.id, username: account.username, endpoint, cursor: 0, revisions: {}, conflicts: [], pending: tasks.map(task => ({ id: uuid(), taskId: task.id, baseRevision: 0, task })) }
}

// Очередь и задания записываются вместе в Notebook: авария не разделит их.
export function trackChanges<T extends Book>(previous: T, next: T, uuid = () => crypto.randomUUID()): T {
  if (!previous.sync) return next
  const old = new Map(previous.tasks.map(t => [t.id, t]))
  const current = new Map(next.tasks.map(t => [t.id, t]))
  let pending = [...previous.sync.pending], conflicts = [...previous.sync.conflicts]
  for (const taskId of new Set([...old.keys(), ...current.keys()])) {
    const task = current.get(taskId) ?? null
    if (sameTask(old.get(taskId) ?? null, task)) continue
    const conflict = conflicts.find(c => c.taskId === taskId)
    if (conflict) {
      conflicts = conflicts.map(c => c.taskId === taskId ? { ...c, local: task } : c)
    } else {
      const existing = pending.find(p => p.taskId === taskId)
      pending = [...pending.filter(p => p.taskId !== taskId), { id: uuid(), taskId, baseRevision: existing?.baseRevision ?? (Object.hasOwn(previous.sync.revisions, taskId) ? previous.sync.revisions[taskId] : 0), task }]
    }
  }
  return { ...next, sync: { ...previous.sync, pending, conflicts } }
}

export function readSyncReply(value: unknown, taskValid: (task: unknown) => boolean): SyncReply {
  const r = value as SyncReply
  const record = (v: RemoteRecord) => v && id(v.id) && revision(v.revision) && (v.task === null || (taskValid(v.task) && v.task.id === v.id))
  if (!r || r.version !== 1 || !revision(r.cursor) || !Array.isArray(r.records) || !r.records.every(record) || new Set(r.records.map(v => v.id)).size !== r.records.length ||
    !Array.isArray(r.accepted) || !r.accepted.every(a => a && id(a.operationId) && id(a.taskId) && revision(a.revision)) ||
    !Array.isArray(r.conflicts) || !r.conflicts.every(c => c && id(c.operationId) && record(c.record)) || r.records.some(v => v.revision > r.cursor)) throw new Error('Сервер вернул некорректные данные. Локальные задания сохранены.')
  return r
}

export function applySync<T extends Book>(book: T, sent: Change[], reply: SyncReply, uuid = () => crypto.randomUUID()): T {
  const s = book.sync
  if (!s) return book
  if (reply.cursor < s.cursor) throw new Error('Серверная копия старше устройства.')
  if (!reply.records.length && !reply.accepted.length && !reply.conflicts.length && reply.cursor === s.cursor) return book
  const operations = new Map(sent.map(p => [p.id, p]))
  let pending = [...s.pending], conflicts = [...s.conflicts]
  const revisions: Record<string, number> = Object.assign(Object.create(null), s.revisions), tasks = new Map(book.tasks.map(t => [t.id, t]))
  for (const a of reply.accepted) {
    const op = operations.get(a.operationId)
    if (!op || op.taskId !== a.taskId) throw new Error('Сервер подтвердил неизвестную операцию.')
    pending = pending.filter(p => p.id !== a.operationId).map(p => p.taskId === a.taskId && p.baseRevision === op.baseRevision ? { ...p, id: uuid(), baseRevision: a.revision } : p)
  }
  for (const c of reply.conflicts) {
    const op = operations.get(c.operationId)
    if (!op || op.taskId !== c.record.id) throw new Error('Сервер вернул неизвестный конфликт.')
    const local = pending.find(p => p.taskId === op.taskId)?.task ?? tasks.get(op.taskId) ?? null
    // Удаление — тоже локальное изменение; null нельзя подменять старой записью.
    const change = pending.find(p => p.taskId === op.taskId)
    conflicts = [...conflicts.filter(v => v.taskId !== op.taskId), { taskId: op.taskId, local: change ? change.task : local, remote: c.record }]
    pending = pending.filter(p => p.taskId !== op.taskId)
  }
  for (const record of reply.records) {
    revisions[record.id] = record.revision
    if (conflicts.some(c => c.taskId === record.id)) {
      conflicts = conflicts.map(c => c.taskId === record.id ? { ...c, remote: record } : c)
      continue
    }
    if (pending.some(p => p.taskId === record.id)) continue
    if (record.task) tasks.set(record.id, record.task)
    else tasks.delete(record.id)
  }
  return { ...book, tasks: [...tasks.values()], sync: { ...s, cursor: reply.cursor, revisions, pending, conflicts } }
}

export function resolveConflict<T extends Book>(book: T, taskId: string, choice: 'local' | 'server', uuid = () => crypto.randomUUID()): T {
  const s = book.sync, conflict = s?.conflicts.find(c => c.taskId === taskId)
  if (!s || !conflict) return book
  const task = choice === 'local' ? conflict.local : conflict.remote.task
  const tasks = book.tasks.filter(t => t.id !== taskId)
  if (task) tasks.push(task)
  return { ...book, tasks, sync: { ...s, revisions: { ...s.revisions, [taskId]: conflict.remote.revision }, conflicts: s.conflicts.filter(c => c.taskId !== taskId),
    pending: choice === 'local' ? [...s.pending, { id: uuid(), taskId, baseRevision: conflict.remote.revision, task }] : s.pending } }
}
