import { useCallback, useEffect, useRef, useState } from 'react'
import { applySync, endpointURL, readSyncReply, resolveConflict, startSync } from './sync-model.ts'
import { validTask, validateNotebook, type Notebook, type useNotebook } from './storage.ts'

type Session = { endpoint: string; token: string; user: { id: string; username: string } }
const SESSION_KEY = 'dz-next:session:v1'
const BEFORE_ACCOUNT = 'dz-next:before-account:v1'
const accountKey = (endpoint: string, id: string) => `dz-next:account:${encodeURIComponent(endpoint)}:${id}`

export class CloudError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export async function apiRequest(endpoint: string, path: string, body: BodyInit, token = '', type = 'application/json', signal?: AbortSignal) {
  let response: Response
  try { response = await fetch(`${endpoint}/${path}`, { method: 'POST', headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body, signal }) }
  catch (e) { if (e instanceof Error && e.name === 'AbortError') throw e; throw new CloudError(0, 'Нет связи с сервером. Задания остаются на устройстве.') }
  let value
  try { value = await response.json() } catch { throw new CloudError(response.status, 'Сервер вернул непонятный ответ.') }
  if (!response.ok) throw new CloudError(response.status, typeof value?.error === 'string' ? value.error : 'Сервер недоступен.')
  return value
}

export function bindAccount(storage: Pick<Storage, 'getItem' | 'setItem'>, book: Notebook, session: Session): Notebook {
  const previous = book.sync
  if (previous?.accountId === session.user.id && previous.endpoint === session.endpoint) return book
  if (!previous) {
    if (!storage.getItem(BEFORE_ACCOUNT)) storage.setItem(BEFORE_ACCOUNT, JSON.stringify(book))
    return { ...book, sync: startSync(book.tasks, session.user, session.endpoint) }
  }
  storage.setItem(accountKey(previous.endpoint, previous.accountId), JSON.stringify(book))
  const raw = storage.getItem(accountKey(session.endpoint, session.user.id))
  if (raw) {
    const saved: unknown = JSON.parse(raw)
    if (!validateNotebook(saved) || saved.sync?.accountId !== session.user.id || saved.sync.endpoint !== session.endpoint) throw new Error('Локальная копия аккаунта повреждена. Сохрани её для восстановления.')
    return { ...book, tasks: saved.tasks, sync: saved.sync }
  }
  return { ...book, tasks: [], sync: startSync([], session.user, session.endpoint) }
}

function readSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as Session | null
    if (value && endpointURL(value.endpoint) === value.endpoint && typeof value.token === 'string' && value.token.length >= 20 && typeof value.user?.id === 'string' && typeof value.user?.username === 'string') return value
  } catch { /* Недоступная сессия не блокирует локальные задания. */ }
  return null
}

export function useCloud(notebook: ReturnType<typeof useNotebook>, demo: boolean) {
  const [session, setSession] = useState<Session | null>(() => demo ? null : readSession())
  const [status, setStatus] = useState(''), [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const bookRef = useRef(notebook), sessionRef = useRef(session)
  bookRef.current = notebook; sessionRef.current = session
  const syncing = useRef(false), controller = useRef<AbortController | null>(null)

  const sync = useCallback(async () => {
    const connection = sessionRef.current, book = bookRef.current
    if (demo || !connection || syncing.current || book.blocked || book.error) return
    if (book.data.sync?.accountId !== connection.user.id || book.data.sync.endpoint !== connection.endpoint) {
      setError('Аккаунт не совпадает с локальной копией. Войди снова.'); return
    }
    syncing.current = true; setStatus('Синхронизирую…'); setError('')
    const request = new AbortController(); controller.current = request
    const timeout = setTimeout(() => request.abort(), 20000)
    const sent = book.data.sync.pending.slice(0, 100)
    try {
      const raw = await apiRequest(connection.endpoint, 'sync', JSON.stringify({ version: 1, cursor: book.data.sync.cursor, operations: sent }), connection.token, 'application/json', request.signal)
      if (sessionRef.current !== connection) return
      const reply = readSyncReply(raw, validTask)
      bookRef.current.replace(current => {
        if (current.sync?.accountId !== connection.user.id || current.sync.endpoint !== connection.endpoint) return current
        return applySync(current, sent, reply)
      })
      setStatus('Сохранено на сервере'); setNeedsLogin(false)
    } catch (e) {
      if (sessionRef.current !== connection) return
      setStatus('Изменения остаются на устройстве')
      setError(e instanceof CloudError || e instanceof Error && e.name !== 'AbortError' ? e.message : 'Нет связи с сервером. Повторим после подключения.')
      if (e instanceof CloudError && e.status === 401) setNeedsLogin(true)
    } finally { clearTimeout(timeout); syncing.current = false; if (controller.current === request) controller.current = null }
  }, [demo])

  useEffect(() => {
    if (!session || demo || needsLogin) return
    const run = () => { if (document.visibilityState !== 'hidden' && navigator.onLine) void sync() }
    run()
    const interval = setInterval(run, 15000)
    window.addEventListener('online', run); document.addEventListener('visibilitychange', run)
    return () => { clearInterval(interval); window.removeEventListener('online', run); document.removeEventListener('visibilitychange', run); controller.current?.abort() }
  }, [session, demo, needsLogin, sync])
  useEffect(() => {
    if (!session || demo || needsLogin || !notebook.data.sync?.pending.length) return
    const timer = setTimeout(() => { if (navigator.onLine) void sync() }, 700)
    return () => clearTimeout(timer)
  }, [session, demo, needsLogin, notebook.data.sync?.pending, sync])

  async function login(address: string, username: string, password: string, registering = false) {
    if (demo) throw new Error('В демо аккаунты отключены.')
    if (bookRef.current.blocked || bookRef.current.error) throw new Error('Сначала сохрани или восстанови данные устройства.')
    const endpoint = endpointURL(address)
    const request = new AbortController(), timeout = setTimeout(() => request.abort(), 20000)
    let connection: Session | undefined
    try {
      const result = await apiRequest(endpoint, registering ? 'register' : 'login', JSON.stringify({ username, password }), '', 'application/json', request.signal)
      if (typeof result.token !== 'string' || typeof result.user?.id !== 'string' || typeof result.user?.username !== 'string') throw new Error('Некорректная сессия сервера.')
      connection = { endpoint, token: result.token, user: result.user }
      controller.current?.abort()
      const next = bindAccount(localStorage, bookRef.current.data, connection)
      const oldSession = localStorage.getItem(SESSION_KEY)
      localStorage.setItem(SESSION_KEY, JSON.stringify(connection))
      try { bookRef.current.replace(next) }
      catch (e) { if (oldSession) localStorage.setItem(SESSION_KEY, oldSession); else localStorage.removeItem(SESSION_KEY); throw e }
      sessionRef.current = connection; setSession(connection); setError(''); setNeedsLogin(false)
    } catch (e) {
      if (connection) void apiRequest(connection.endpoint, 'logout', '{}', connection.token, 'application/json', AbortSignal.timeout(10000)).catch(() => {})
      throw e
    } finally { clearTimeout(timeout) }
  }

  async function register(address: string, username: string, password: string) {
    return login(address, username, password, true)
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    const old = sessionRef.current
    sessionRef.current = null; setSession(null); controller.current?.abort(); setStatus('Аккаунт отключён. Задания остались на устройстве.'); setError(''); setNeedsLogin(false)
    if (old) {
      const request = new AbortController(), timeout = setTimeout(() => request.abort(), 10000)
      void apiRequest(old.endpoint, 'logout', '{}', old.token, 'application/json', request.signal).catch(() => {}).finally(() => clearTimeout(timeout))
    }
  }

  async function agent(path: string, body: BodyInit, type: string, signal: AbortSignal) {
    const connection = sessionRef.current
    if (demo || !connection || needsLogin) throw new Error('Для серверного агента войди в аккаунт.')
    return apiRequest(connection.endpoint, `agent/${path}`, body, connection.token, type, signal)
  }
  function chooseConflict(taskId: string, choice: 'local' | 'server') {
    bookRef.current.replace(current => resolveConflict(current, taskId, choice))
  }
  return { session, status, error, needsLogin, login, register, logout, sync, agent, chooseConflict, enabled: Boolean(session && !needsLogin) }
}
