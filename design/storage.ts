import { useEffect, useRef, useState, type SetStateAction } from 'react'
import type { DemoTask } from './data'
import { trackChanges, validSync, sameTask, type SyncState } from './sync-model.ts'

export const STORAGE_KEY = 'dz-next:v1'
export type Notebook = { version: 1; tasks: DemoTask[]; theme: 'light' | 'dark' | 'black' | 'system'; collapsed: string[]; animationSpeed?: 'fast' | 'normal' | 'smooth'; sync?: SyncState; autoAdd?: boolean }
export const freshNotebook = (): Notebook => ({ version: 1, tasks: [], theme: 'system', collapsed: [] })
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function validateNotebook(value: unknown): value is Notebook {
  if (!value || typeof value !== 'object') return false
  const d = value as Notebook
  return (d.sync === undefined || validSync(d.sync, validTask)) && (d.autoAdd === undefined || typeof d.autoAdd === 'boolean') && (d.animationSpeed === undefined || ['fast', 'normal', 'smooth'].includes(d.animationSpeed)) && d.version === 1 && ['light', 'dark', 'black', 'system'].includes(d.theme) && Array.isArray(d.collapsed) && d.collapsed.every(validDate) && Array.isArray(d.tasks) &&
    new Set(d.tasks.map(t => t?.id)).size === d.tasks.length && d.tasks.every(t => t && typeof t.id === 'string' && t.id.length > 0 && typeof t.title === 'string' && t.title.trim().length > 0 && typeof t.subjectId === 'string' && typeof t.done === 'boolean' && validDate(t.due) && (t.lessonId === undefined || typeof t.lessonId === 'string') && (t.entryType === undefined || ['homework', 'note'].includes(t.entryType)) && (t.testBatchId === undefined || (typeof t.testBatchId === 'string' && t.testBatchId.trim().length > 0)) && (t.kind === undefined || ['lecture', 'seminar', 'lab', 'other'].includes(t.kind)))
}
export function validTask(task: unknown): task is DemoTask {
  return validateNotebook({ ...freshNotebook(), tasks: [task] })
}
export function readNotebook(storage: Pick<Storage, 'getItem'>) {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return freshNotebook()
  const data: unknown = JSON.parse(raw)
  if (!validateNotebook(data)) throw new Error('Некорректные сохранённые данные')
  return data
}
export function persistNotebook(storage: Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem'>>, data: Notebook, expectedRaw?: string | null) {
  if (!validateNotebook(data)) throw new Error('Некорректные данные для сохранения')
  if (expectedRaw !== undefined && storage.getItem?.(STORAGE_KEY) !== expectedRaw) throw new Error('Данные изменились в другой вкладке. Перезагрузи страницу перед редактированием.')
  const raw = JSON.stringify(data)
  storage.setItem(STORAGE_KEY, raw)
  return raw
}
export function useNotebook(demo: Notebook | null) {
  const [initial] = useState(() => {
    if (demo) return { data: demo, blocked: false, raw: null }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return { data: readNotebook({ getItem: () => raw }), blocked: false, raw }
    }
    catch { return { data: freshNotebook(), blocked: true, raw: null } }
  })
  const [data, setData] = useState(initial.data)
  const current = useRef(data)
  const savedRaw = useRef(initial.raw), unsaved = useRef(false)
  const [error, setError] = useState(initial.blocked ? 'Не удалось прочитать сохранённые данные. Они не перезаписаны. Сохрани копию данных устройства и перезагрузи страницу.' : '')
  useEffect(() => {
    if (demo || initial.blocked) return
    const changed = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== STORAGE_KEY && event.key !== null) return
      if (unsaved.current) { setError('Другая вкладка изменила данные. Скачай копию несохранённых изменений перед перезагрузкой.'); return }
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw === null) throw new Error('Данные удалены в другой вкладке.')
        const next = readNotebook({ getItem: () => raw })
        savedRaw.current = raw; current.current = next; setData(next); setError('')
      } catch { setError('Данные изменились в другой вкладке и не могут быть прочитаны. Сохрани копию перед перезагрузкой.') }
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [demo, initial.blocked])
  const write = (value: SetStateAction<Notebook>, track: boolean, strict: boolean) => {
    let next = typeof value === 'function' ? value(current.current) : value
    if (track) next = trackChanges(current.current, next)
    if (next === current.current) return
    if (initial.blocked && strict) throw new Error('Сначала восстанови данные устройства.')
    if (!demo && !initial.blocked) {
      try { savedRaw.current = persistNotebook(localStorage, next, savedRaw.current); unsaved.current = false; setError('') }
      catch (e) {
        unsaved.current = true
        setError(e instanceof Error && e.message.includes('другой вкладке') ? e.message : 'Не удалось сохранить изменения на устройстве. Не закрывай страницу: скачай резервную копию и освободи место.')
        if (strict) throw e
      }
    }
    current.current = next; setData(next)
  }
  const update = (next: SetStateAction<Notebook>) => write(next, true, false)
  const commit = (next: SetStateAction<Notebook>) => write(next, true, true)
  const replace = (next: SetStateAction<Notebook>) => write(next, false, true)
  return { data, update, commit, replace, error, blocked: initial.blocked }
}

export function importTasks(book: Notebook, raw: string, uuid = () => crypto.randomUUID()) {
  const value = JSON.parse(raw)
  // Файл переносит задания; привязку аккаунта и очередь другого устройства не импортируем.
  if (!value || typeof value !== 'object') throw new Error('Нужен файл резервной копии ДЗ.')
  const { sync: _sync, ...backup } = value
  if (!validateNotebook(backup)) throw new Error('Файл не подходит или содержит повреждённые данные.')
  const tasks = [...book.tasks]
  for (const original of backup.tasks) {
    if (tasks.some(t => sameTask({ ...t, id: original.id }, original))) continue
    tasks.push(tasks.some(t => t.id === original.id) ? { ...original, id: uuid() } : original)
  }
  return { ...book, tasks }
}
export function downloadBackup(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
