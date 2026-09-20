import { useEffect, useState, type SetStateAction } from 'react'
import type { DemoTask } from './data'

export const STORAGE_KEY = 'dz-next:v1'
export type Notebook = { version: 1; tasks: DemoTask[]; theme: 'light' | 'dark' | 'system'; collapsed: string[] }
export const freshNotebook = (): Notebook => ({ version: 1, tasks: [], theme: 'system', collapsed: [] })
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function validateNotebook(value: unknown): value is Notebook {
  if (!value || typeof value !== 'object') return false
  const d = value as Notebook
  return d.version === 1 && ['light', 'dark', 'system'].includes(d.theme) && Array.isArray(d.collapsed) && d.collapsed.every(validDate) && Array.isArray(d.tasks) &&
    new Set(d.tasks.map(t => t?.id)).size === d.tasks.length && d.tasks.every(t => t && typeof t.id === 'string' && t.id.length > 0 && typeof t.title === 'string' && t.title.trim().length > 0 && typeof t.subjectId === 'string' && typeof t.done === 'boolean' && validDate(t.due) && (t.lessonId === undefined || typeof t.lessonId === 'string') && (t.kind === undefined || ['lecture', 'seminar', 'lab', 'other'].includes(t.kind)))
}
export function readNotebook(storage: Pick<Storage, 'getItem'>) {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return freshNotebook()
  const data: unknown = JSON.parse(raw)
  if (!validateNotebook(data)) throw new Error('Некорректные сохранённые данные')
  return data
}
export function persistNotebook(storage: Pick<Storage, 'setItem'>, data: Notebook) {
  if (!validateNotebook(data)) throw new Error('Некорректные данные для сохранения')
  storage.setItem(STORAGE_KEY, JSON.stringify(data))
}
export function useNotebook(demo: Notebook | null) {
  const [initial] = useState(() => {
    if (demo) return { data: demo, blocked: false }
    try { return { data: readNotebook(localStorage), blocked: false } }
    catch { return { data: freshNotebook(), blocked: true } }
  })
  const [data, setData] = useState(initial.data)
  const [error, setError] = useState(initial.blocked ? 'Не удалось прочитать сохранённые данные. Они не перезаписаны. Сохрани копию данных устройства и перезагрузи страницу.' : '')
  useEffect(() => {
    if (demo || initial.blocked) return
    try { persistNotebook(localStorage, data); setError('') }
    catch { setError('Не удалось сохранить изменения на устройстве. Не закрывай страницу: скачай резервную копию и освободи место.') }
  }, [data, Boolean(demo), initial.blocked])
  const update = (next: SetStateAction<Notebook>) => setData(next)
  return { data, update, error, blocked: initial.blocked }
}
export function downloadBackup(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
