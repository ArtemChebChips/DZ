import { useSyncExternalStore } from 'react'

export type Theme = 'quiet' | 'night' | 'adhd'

const KEY = 'dz:theme'

/** Цвет строки состояния телефона — должен совпадать с фоном темы. */
const THEME_COLOR: Record<Theme, string> = {
  quiet: '#e9ebee',
  night: '#14161d',
  adhd: '#f7ee5e',
}

function read(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'night' || value === 'adhd' || value === 'quiet') return value
  } catch {
    // Приватный режим — просто остаёмся на теме по умолчанию.
  }
  return 'quiet'
}

let current: Theme = read()
const listeners = new Set<() => void>()

function apply(theme: Theme): void {
  const root = document.documentElement
  // Тихая тема живёт в голом :root, поэтому атрибут для неё не нужен.
  if (theme === 'quiet') root.removeAttribute('data-theme')
  else root.dataset.theme = theme

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

apply(current)

export function setTheme(theme: Theme): void {
  current = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Не смогли сохранить — тема всё равно применится до перезагрузки.
  }
  apply(theme)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Theme {
  return current
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
