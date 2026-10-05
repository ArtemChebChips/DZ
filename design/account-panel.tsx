import { useState } from 'react'
import { DEFAULT_LESSONS, subjectName, kindName, type DemoTask } from './data'
import type { SyncState } from './sync-model'
import type { useCloud } from './use-cloud'

function describe(task: DemoTask | null) {
  if (!task) return 'Удалено'
  const lesson = DEFAULT_LESSONS.find(l => l.id === task.lessonId)
  return [subjectName(task.subjectId), task.title, task.due, task.entryType === 'note' ? 'Заметка' : 'ДЗ', task.kind && kindName[task.kind], lesson && `${lesson.start}–${lesson.end}`, task.done ? 'выполнено' : 'не выполнено'].filter(Boolean).join(' · ')
}

export function AccountPanel({ cloud, state, demo }: { cloud: ReturnType<typeof useCloud>; state?: SyncState; demo: boolean }) {
  const [address, setAddress] = useState(cloud.session?.endpoint ?? import.meta.env.VITE_DZ_API_URL ?? (import.meta.env.DEV ? `${location.origin}/api` : ''))
  const [username, setUsername] = useState(cloud.session?.user.username ?? state?.username ?? '')
  const [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  if (demo) return <p>В демонстрации аккаунт и синхронизация отключены. Твои данные не меняются.</p>
  const showLogin = !cloud.session || cloud.needsLogin
  return <div className="account-panel">
    {showLogin ? <form onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError('')
      try { await cloud.login(address.trim(), username.trim(), password); setPassword('') }
      catch (e) { setError(e instanceof Error ? e.message : 'Не удалось войти.') }
      finally { setBusy(false) }
    }}>
      <p>Войди, чтобы сохранять задания на сервере и открывать их на другом устройстве. Без входа приложение работает на этом устройстве.</p>
      <label>Адрес сервера<input type="url" value={address} placeholder="https://dz.example.com" required disabled={busy} onChange={e => setAddress(e.target.value)} /></label>
      <label>Логин<input autoComplete="username" value={username} required maxLength={40} disabled={busy} onChange={e => setUsername(e.target.value)} /></label>
      <label>Пароль<input type="password" autoComplete="current-password" value={password} required maxLength={256} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
      {state && <p>На устройстве — записи аккаунта {state.username}. При входе в другой аккаунт они сохранятся отдельной локальной копией.</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'Вхожу…' : 'Войти'}</button>
    </form> : <>
      <p>Аккаунт: <strong>{cloud.session!.user.username}</strong></p>
      <p role="status">{cloud.status || 'Синхронизация подключена'}</p>
      <p>Ожидают отправки: {state?.pending.length ?? 0}. Требуют выбора: {state?.conflicts.length ?? 0}.</p>
      <button className="outline-button" onClick={() => void cloud.sync()}>Синхронизировать сейчас</button>
    </>}
    {cloud.session && <button className="text-button" onClick={() => { try { cloud.logout() } catch { setError('Браузер не дал отключить аккаунт. Попробуй ещё раз.') } }}>Выйти из аккаунта</button>}
    {(error || cloud.error) && <p role="alert">{error || cloud.error}</p>}
    {state?.conflicts.map(c => <fieldset key={c.taskId}><legend>Задание изменено на двух устройствах</legend>
      <p><strong>На этом устройстве:</strong><br />{describe(c.local)}</p>
      <p><strong>На сервере:</strong><br />{describe(c.remote.task)}</p>
      <button className="outline-button" onClick={() => { try { cloud.chooseConflict(c.taskId, 'local'); setError('') } catch { setError('Не удалось сохранить выбор на устройстве.') } }}>Оставить мою версию</button>
      <button className="outline-button" onClick={() => { try { cloud.chooseConflict(c.taskId, 'server'); setError('') } catch { setError('Не удалось сохранить выбор на устройстве.') } }}>Взять с сервера</button>
    </fieldset>)}
  </div>
}
