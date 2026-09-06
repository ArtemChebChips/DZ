/**
 * Цвета предметов. В Subject.color лежит только ключ, а сам цвет живёт в CSS
 * переменной — так он подстраивается под тему: в ночной те же предметы
 * должны светиться, а не темнеть.
 */
export const PALETTE_KEYS = [
  'blue',
  'violet',
  'pink',
  'red',
  'orange',
  'amber',
  'lime',
  'green',
  'teal',
  'cyan',
  'slate',
] as const

export type ColorKey = (typeof PALETTE_KEYS)[number]

/** Значения для превью в редакторе предметов — берутся из активной темы. */
export function colorOf(key: string | undefined): string {
  const safe = key && (PALETTE_KEYS as readonly string[]).includes(key) ? key : 'slate'
  return `var(--subj-${safe})`
}

/** Цвет для следующего предмета — берём наименее занятый. */
export function pickColor(used: string[]): string {
  const counts = new Map<string, number>(PALETTE_KEYS.map((k) => [k, 0]))
  for (const c of used) if (counts.has(c)) counts.set(c, counts.get(c)! + 1)
  let best: string = PALETTE_KEYS[0]
  for (const k of PALETTE_KEYS) if (counts.get(k)! < counts.get(best)!) best = k
  return best
}
