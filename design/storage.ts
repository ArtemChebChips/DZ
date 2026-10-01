import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import type { DemoTask } from './data'

export const STORAGE_KEY = 'dz-next:v1'
export type Notebook = { version: 1; tasks: DemoTask[]; theme: 'light' | 'dark' | 'black' | 'system'; collapsed: string[]; animationSpeed?: 'fast' | 'normal' | 'smooth' }
export const freshNotebook = (): Notebook => ({ version: 1, tasks: [], theme: 'system', collapsed: [] })
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function validateNotebook(value: unknown): value is Notebook {
  if (!value || typeof value !== 'object') return false
  const d = value as Notebook
  return (d.animationSpeed === undefined || ['fast', 'normal', 'smooth'].includes(d.animationSpeed)) && d.version === 1 && ['light', 'dark', 'black', 'system'].includes(d.theme) && Array.isArray(d.collapsed) && d.collapsed.every(validDate) && Array.isArray(d.tasks) &&
    new Set(d.tasks.map(t => t?.id)).size === d.tasks.length && d.tasks.every(t => t && typeof t.id === 'string' && t.id.length > 0 && typeof t.title === 'string' && t.title.trim().length > 0 && typeof t.subjectId === 'string' && typeof t.done === 'boolean' && validDate(t.due) && (t.lessonId === undefined || typeof t.lessonId === 'string') && (t.entryType === undefined || ['homework', 'note'].includes(t.entryType)) && (t.testBatchId === undefined || (typeof t.testBatchId === 'string' && t.testBatchId.trim().length > 0)) && (t.kind === undefined || ['lecture', 'seminar', 'lab', 'other'].includes(t.kind)))
}
export function readNotebook(storage: Pick<Storage, 'getItem'>) {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return freshNotebook()
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
    if (demo) return { data: demo, raw: null, blocked: false }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return { data: readNotebook({ getItem: () => raw }), raw, blocked: false }
    } catch { return { data: freshNotebook(), raw: null, blocked: true } }
  })
  const [data, setData] = useState(initial.data)
  const [blocked, setBlocked] = useState(initial.blocked)
  const readError = 'Не удалось прочитать сохранённые данные. Они не перезаписаны. Сохрани копию данных устройства и перезагрузи страницу.'
  const saveError = 'Не удалось сохранить изменения на устройстве. Не закрывай страницу: скачай резервную копию и освободи место.'
  const conflictError = 'В другом окне изменились данные, а здесь есть несохранённые изменения. Скачай резервную копию этой страницы перед перезагрузкой. Данные другого окна не перезаписаны.'
  const [error, setError] = useState(initial.blocked ? readError : '')
  const state = useRef({ data: initial.data, raw: initial.raw, blocked: initial.blocked, unsaved: false, conflict: false })
  const isDemo = Boolean(demo)
  const update = useCallback(async (next: SetStateAction<Notebook>, keepOnFailure = true) => {
    const commit = (lockError = '') => {
      const current = state.current
      let base = current.data
      let failure = lockError || (current.blocked ? readError : current.conflict ? conflictError : '')
      if (!isDemo && !failure) {
        try {
          const raw = localStorage.getItem(STORAGE_KEY)
          if (current.unsaved && raw !== current.raw) {
            current.conflict = true; failure = conflictError
          } else {
            // Читаем перед записью: событие storage из другого окна может ещё не прийти.
            base = current.unsaved ? current.data : readNotebook({ getItem: () => raw })
            current.raw = raw
          }
        } catch { current.blocked = true; setBlocked(true); failure = readError }
      }
      const value = typeof next === 'function' ? next(base) : next
      if (!isDemo && !failure) {
        try { persistNotebook(localStorage, value); current.raw = JSON.stringify(value) }
        catch { failure = saveError }
      }
      if (!failure || keepOnFailure) {
        current.data = value; current.unsaved = Boolean(failure)
        setData(value)
      }
      setError(failure)
      return !failure
    }
    if (isDemo) return commit()
    // Блокировка общая для корня и /next/. Само чтение и запись синхронные;
    // очередь не даёт двум окнам прочитать и перезаписать одну старую копию.
    if (!navigator.locks) return commit('Сохранение недоступно в этом браузере. Открой приложение в актуальном Safari или Chrome. Не закрывай страницу без резервной копии.')
    try { return await navigator.locks.request(STORAGE_KEY, () => commit()) }
    catch { return commit(saveError) }
  }, [isDemo])
  useEffect(() => {
    if (isDemo) return
    const refresh = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      const current = state.current
      if (current.blocked || current.conflict) return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (current.unsaved) {
          if (raw !== current.raw) { current.conflict = true; setError(conflictError) }
          return
        }
        const value = readNotebook({ getItem: () => raw })
        current.data = value; current.raw = raw
        setData(value); setError('')
      } catch { current.blocked = true; setBlocked(true); setError(readError) }
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [isDemo])
  return { data, update, error, blocked }
}
export function downloadBackup(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
