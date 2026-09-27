import { diffDays, mondayOf } from '../src/lib/dates.ts'

/** Учебные недели от начала семестра, не ISO-недели года. */
export function academicWeek(date: string, firstMonday: string): number | null {
  const index = Math.floor(diffDays(firstMonday, mondayOf(date)) / 7)
  return index < 0 ? null : index + 1
}
