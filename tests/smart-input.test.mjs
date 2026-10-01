import test from 'node:test'
import assert from 'node:assert/strict'
import { readIntents, resolveProposal } from '../design/smart-input.ts'
import { DEFAULT_SUBJECTS as subjects, DEFAULT_LESSONS as lessons, ANCHOR_MONDAY as anchor } from '../src/data/schedule.ts'
const intent = (deadline, subjectId = 'prob') => ({ subjectId, title: 'Решить 301, 302, 303', deadlineText: 'на следующую пару', question: '', deadline })
const resolve = (x, time = '2026-09-29T16:00:00') => resolveProposal(x, subjects, lessons, anchor, new Date(time))
test('Следующий семинар после начала сегодняшнего — через неделю', () => {
  const p = resolve(intent({ type: 'nextLesson', value: '', kind: 'seminar' }))
  assert.equal(p.due, '2026-10-06'); assert.equal(p.lessonId, 'vt-6')
})
test('Следующая лабораторная учитывает знаменатель и индивидуальное время', () => {
  const p = resolve(intent({ type: 'nextLesson', value: '', kind: 'lab' }, 'phys'), '2026-09-28T16:00:00')
  assert.equal(p.due, '2026-09-28'); assert.equal(p.lessonId, 'pn-5')
})
test('Две следующие лабораторные одного дня требуют выбора конкретной пары', () => {
  const p = resolve(intent({ type: 'nextLesson', value: '', kind: 'lab' }, 'phys'), '2026-09-28T08:00:00')
  assert.equal(p.due, '2026-09-28'); assert.equal(p.lessonId, undefined); assert.ok(p.question)
})
test('Неуказанный вид, день недели и пропущенный срок не получают выдуманную дату', () => {
  for (const d of [{type:'nextLesson',value:'',kind:''},{type:'weekday',value:'4',kind:''},{type:'missing',value:'',kind:''}]) {
    const p = resolve(intent(d)); assert.equal(p.due, ''); assert.ok(p.question)
  }
})
test('ВУЦ сохраняется заметкой с предметом, содержание остаётся целым', () => {
  const p = resolve({...intent({type:'days',value:'1',kind:''}, 'vuc'),title:'Пройти тесты по оружию: 4.1, 4.2, 4.3 и 4.5'})
  assert.equal(p.entryType, 'note'); assert.equal(p.due,'2026-09-30'); assert.match(p.title,/по оружию/)
})
test('Недействительные ответы и даты отвергаются', () => {
  assert.throws(() => readIntents({tasks:[]})); assert.throws(() => readIntents({tasks:[{}]}))
  assert.equal(resolve(intent({type:'date',value:'2026-02-30',kind:''})).due,'')
  assert.equal(resolve(intent({type:'days',value:'1',kind:''}, 'unknown')).subjectId,'')
})
