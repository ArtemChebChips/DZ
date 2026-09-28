import { useEffect, useRef, useState } from 'react'
import { DEFAULT_LESSONS, DEFAULT_SUBJECTS, ANCHOR_MONDAY, type Draft } from './data'
import { contextFor, readIntents, resolveProposal, type Proposal } from './smart-input'
import { validDate } from './storage'

export function SmartInputPanel({ save }: { save: (drafts: Draft[]) => void }) {
  const [text, setText] = useState(''), [correction, setCorrection] = useState('')
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [busy, setBusy] = useState(''), [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null)
  const request = useRef<AbortController | null>(null), active = useRef(true), saved = useRef(false)
  const discard = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    active.current = true
    return () => { active.current = false; request.current?.abort(); clearTimeout(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()) }
  }, [])
  useEffect(() => { if (!recording) return; const id = setInterval(() => setSeconds(n => n + 1), 1000); return () => clearInterval(id) }, [recording])
  async function send(path: string, body: BodyInit, type: string) {
    const controller = new AbortController(); request.current = controller
    const timeout = setTimeout(() => controller.abort(), 130000)
    try {
      const response = await fetch(`/agent/${path}`, { method: 'POST', headers: { 'Content-Type': type, 'X-DZ-Client': 'local' }, body, signal: controller.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Не удалось обработать запрос.')
      return result
    } finally { clearTimeout(timeout) }
  }
  async function parse() {
    if (busy || !text.trim()) return
    setBusy('Разбираю задания…'); setError('')
    const now = new Date()
    try {
      const result = await send('parse', JSON.stringify({ text, correction, previousTasks: proposals, context: contextFor(DEFAULT_SUBJECTS, DEFAULT_LESSONS, ANCHOR_MONDAY, now) }), 'application/json')
      if (active.current) setProposals(readIntents(result).map(x => resolveProposal(x, DEFAULT_SUBJECTS, DEFAULT_LESSONS, ANCHOR_MONDAY, now)))
    } catch (e) { if (active.current) setError(e instanceof Error && e.name !== 'AbortError' && !e.message.includes('JSON') ? e.message : 'Сервис недоступен или запрос отменён. Текст остался на экране.') }
    finally { if (active.current) setBusy('') }
  }
  async function record() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Запись недоступна в этом браузере. Введи текст.'); return }
    setBusy('Включаю микрофон…')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!active.current) { media.getTracks().forEach(t => t.stop()); return }
      stream.current = media
      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t))
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      recorder.current = rec
      const chunks: BlobPart[] = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = async () => {
        clearTimeout(timer.current); media.getTracks().forEach(t => t.stop())
        if (!active.current) return
        setRecording(false); if (discard.current) { setBusy(''); return }; setBusy('Распознаю речь…')
        try { const result = await send('transcribe', new Blob(chunks, { type: rec.mimeType }), rec.mimeType || 'application/octet-stream'); if (active.current) { setText(result.text); setProposals([]); setCorrection('') } }
        catch { if (active.current) setError('Не удалось распознать запись. Попробуй ещё раз или введи текст.') }
        finally { if (active.current) setBusy('') }
      }
      discard.current = false; rec.start(); setSeconds(0); setRecording(true); setBusy('')
      timer.current = setTimeout(() => { if (rec.state === 'recording') rec.stop() }, 59000)
    } catch { stream.current?.getTracks().forEach(t => t.stop()); setBusy(''); setError('Нет доступа к микрофону. Разреши его в браузере или введи текст.') }
  }
  const patch = (index: number, value: Partial<Proposal>) => setProposals(items => items.map((p, i) => i === index ? { ...p, ...value } : p))
  const selected = proposals.filter(p => p.selected)
  const ready = selected.length > 0 && selected.every(p => p.subjectId && p.title.trim() && validDate(p.due) && !p.question)
  return <div className="smart-input">
    <p>Напиши или надиктуй задания. Перед добавлением проверь предметы, текст и даты.</p>
    <textarea aria-label="Текст заданий" placeholder="По теорверу на следующий семинар решить 301, 302, 303" value={text} maxLength={8000} disabled={Boolean(busy) || recording} onChange={e => { setText(e.target.value); setProposals([]); setCorrection('') }} />
    <button className="outline-button" disabled={Boolean(busy)} onClick={recording ? () => recorder.current?.stop() : record}>{recording ? `Остановить запись · ${seconds} с` : 'Надиктовать'}</button>
    {recording && <button className="text-button" onClick={() => { discard.current = true; recorder.current?.stop() }}>Отменить запись</button>}
    <small>Речь распознаётся на Mac. По кнопке «Разобрать» текст и расписание отправляются в Claude через твою подписку.</small>
    {proposals.length > 0 && <label>Уточнение<textarea aria-label="Уточнение" value={correction} maxLength={2000} onChange={e => setCorrection(e.target.value)} placeholder="Нет, по ВУЦ, на 1 октября 2026" /></label>}
    <button className="primary-button" disabled={Boolean(busy) || recording || !text.trim()} onClick={parse}>{busy || (proposals.length ? 'Разобрать с уточнением' : 'Разобрать задания')}</button>
    {busy && <button className="text-button" onClick={() => request.current?.abort()}>Отменить запрос</button>}
    {error && <p role="alert">{error}</p>}
    {proposals.map((p, i) => <fieldset key={i} disabled={Boolean(busy)}><legend><label><input type="checkbox" checked={p.selected} onChange={e => patch(i, { selected: e.target.checked })} /> Добавить {i + 1}</label></legend>
      <label>Предмет<select value={p.subjectId} onChange={e => patch(i, { subjectId: e.target.value, lessonId: undefined, kind: undefined, entryType: DEFAULT_LESSONS.some(l => l.subjectId === e.target.value && ['lab', 'seminar'].includes(l.kind)) ? 'homework' : 'note' })}><option value="">Выбери предмет</option>{DEFAULT_SUBJECTS.map(s => <option value={s.id} key={s.id}>{s.short || s.name}</option>)}</select></label>
      <label>Задание<textarea value={p.title} onChange={e => patch(i, { title: e.target.value })} /></label>
      <label>Дата<input type="date" value={p.due} onChange={e => patch(i, { due: e.target.value, lessonId: undefined, kind: undefined })} /></label>
      <small>Срок из текста: {p.deadlineText || 'не указан'}</small>
      {p.question && <div><p>{p.question}</p><button className="outline-button" disabled={!p.subjectId || !validDate(p.due)} onClick={() => patch(i, { question: '' })}>Проверил предмет, текст и дату</button></div>}
    </fieldset>)}
    {proposals.length > 0 && <button className="primary-button" disabled={!ready || Boolean(busy) || recording} onClick={() => {
      if (saved.current || !ready) return
      saved.current = true
      try { save(selected.map(({ selected: _s, question: _q, deadlineText: _d, ...draft }) => draft)) }
      catch { saved.current = false; setError('Не удалось сохранить. Черновики остались здесь.') }
    }}>Добавить задания ({selected.length})</button>}
  </div>
}
