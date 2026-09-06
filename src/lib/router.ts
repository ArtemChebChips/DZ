import { useSyncExternalStore } from 'react'

/**
 * Роутинг на хеше: с ним приложение одинаково работает и на GitHub Pages,
 * и офлайн с домашнего экрана, где сервера, который отдал бы /day/..., просто нет.
 */

export type Route =
  | { name: 'tasks' }
  | { name: 'calendar' }
  | { name: 'day'; date: string }
  | { name: 'settings' }
  | { name: 'schedule' }
  | { name: 'subjects' }

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\//, '')
  const [head, arg] = path.split('/')
  switch (head) {
    case 'calendar':
      return { name: 'calendar' }
    case 'day':
      return arg && ISO_RE.test(arg) ? { name: 'day', date: arg } : { name: 'calendar' }
    case 'settings':
      return { name: 'settings' }
    case 'schedule':
      return { name: 'schedule' }
    case 'subjects':
      return { name: 'subjects' }
    default:
      return { name: 'tasks' }
  }
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

function getSnapshot(): string {
  return window.location.hash
}

export function useRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, getSnapshot, getSnapshot))
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('/') ? path : `/${path}`
}

export function goBack(): void {
  if (window.history.length > 1) window.history.back()
  else navigate('/')
}

export const routes = {
  tasks: '/',
  calendar: '/calendar',
  day: (iso: string) => `/day/${iso}`,
  settings: '/settings',
  schedule: '/schedule',
  subjects: '/subjects',
}
