/**
 * Даты живут как строки 'YYYY-MM-DD' в локальном времени.
 * Через Date их гонять опасно: new Date('2026-09-06') парсится как UTC
 * и в минусовых поясах уезжает на день назад. Поэтому парсим руками.
 */

export const WEEKDAYS_FULL = [
  'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
]
export const WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
export const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
export const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(): string {
  return toISO(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Понедельник = 1 ... воскресенье = 7. */
export function weekdayOf(iso: string): number {
  const js = parseISO(iso).getDay()
  return js === 0 ? 7 : js
}

export function mondayOf(iso: string): string {
  return addDays(iso, -(weekdayOf(iso) - 1))
}

/** Сколько дней от a до b: положительное значит b позже. */
export function diffDays(a: string, b: string): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** «6 сентября, суббота» */
export function formatFull(iso: string): string {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEKDAYS_FULL[weekdayOf(iso) - 1]}`
}

/** «6 сентября» */
export function formatDayMonth(iso: string): string {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

/** «пн, 6 сент.» — для компактных карточек. */
export function formatCompact(iso: string): string {
  const d = parseISO(iso)
  const month = MONTHS_GEN[d.getMonth()].slice(0, 3)
  return `${WEEKDAYS_SHORT[weekdayOf(iso) - 1]}, ${d.getDate()} ${month}.`
}

/** «сегодня» / «завтра» / «через 3 дня» / «просрочено на 2 дня» */
export function humanDue(due: string, from: string = todayISO()): string {
  const n = diffDays(from, due)
  if (n === 0) return 'сегодня'
  if (n === 1) return 'завтра'
  if (n === 2) return 'послезавтра'
  if (n === -1) return 'вчера'
  if (n < 0) {
    const k = -n
    return `просрочено на ${k} ${plural(k, 'день', 'дня', 'дней')}`
  }
  return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`
}
