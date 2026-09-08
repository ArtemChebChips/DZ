import type { AppData } from '../types'
import { parseISO, toISO } from './dates'

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const str = (value: unknown): value is string => typeof value === 'string'
const nonempty = (value: unknown): value is string => str(value) && value.trim().length > 0
const date = (value: unknown): value is string => str(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && toISO(parseISO(value)) === value
const time = (value: unknown): value is string => str(value) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const optionalStrings = (obj: Record<string, unknown>, keys: string[]) => keys.every(key => obj[key] === undefined || str(obj[key]))

/** Принимает актуальные резервные копии обеих версий, до изменения состояния. */
export function parseBackup(text: string): AppData {
  const fail = (): never => { throw new Error('Файл не похож на резервную копию ДЗ') }
  const raw: unknown = JSON.parse(text)
  if (!record(raw) || raw.version !== 2 || !Array.isArray(raw.subjects) || !Array.isArray(raw.lessons) || !Array.isArray(raw.tasks)) return fail()
  if (!record(raw.settings) || !date(raw.settings.anchorMonday)) return fail()
  const ids = new Set<string>()
  for (const s of raw.subjects) {
    if (!record(s) || !nonempty(s.id) || ids.has(s.id) || !nonempty(s.name) || !nonempty(s.color) || !str(s.updatedAt) || !optionalStrings(s, ['short'])) return fail()
    ids.add(s.id)
  }
  for (const [kind, items] of [['lesson', raw.lessons], ['task', raw.tasks]] as const) {
    const itemIds = new Set<string>()
    for (const item of items) {
      if (!record(item) || !nonempty(item.id) || itemIds.has(item.id) || !str(item.subjectId) || !ids.has(item.subjectId) || !str(item.updatedAt)) return fail()
      itemIds.add(item.id)
      if (kind === 'lesson') {
        if (!Number.isInteger(item.weekday) || Number(item.weekday) < 1 || Number(item.weekday) > 6 || !time(item.start) || !time(item.end) || !['num', 'denom', 'both'].includes(String(item.parity)) || !['lecture', 'seminar', 'lab', 'other'].includes(String(item.kind)) || !optionalStrings(item, ['room', 'building', 'teacher'])) return fail()
      } else if (!nonempty(item.title) || !date(item.due) || typeof item.done !== 'boolean' || !str(item.createdAt) || !optionalStrings(item, ['note', 'doneAt', 'authorId'])) return fail()
    }
  }
  return raw as unknown as AppData
}
