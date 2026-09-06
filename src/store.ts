import { useSyncExternalStore } from 'react'
import type { AppData, Lesson, Settings, Subject, Task } from './types'
import { mondayOf, todayISO } from './lib/dates'
import { ANCHOR_MONDAY, DEFAULT_LESSONS, DEFAULT_SUBJECTS } from './data/schedule'

const STORAGE_KEY = 'dz:data'
const DEVICE_KEY = 'dz:device'
/** 2 — время переехало с общей сетки звонков внутрь каждой пары. */
const DATA_VERSION = 2

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function now(): string {
  return new Date().toISOString()
}

/** Постоянный id устройства — пригодится, когда появится общая база с одногруппниками. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = uid()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'local'
  }
}

function freshData(): AppData {
  const settings: Settings = { anchorMonday: ANCHOR_MONDAY }
  return {
    version: DATA_VERSION,
    subjects: DEFAULT_SUBJECTS,
    lessons: DEFAULT_LESSONS,
    tasks: [],
    settings,
  }
}

/** Чиним данные, пришедшие из localStorage или из импортированного файла. */
function normalize(raw: Partial<AppData> | null | undefined): AppData {
  const base = freshData()
  if (!raw || typeof raw !== 'object') return base

  /*
   * До версии 2 у пары был номер слота, а время лежало в общей сетке звонков.
   * Такие записи без start/end отрисовать нечем, поэтому расписание и предметы
   * берём заново из умолчаний. Задания при этом не теряются.
   */
  const lessonsUsable =
    Array.isArray(raw.lessons) && raw.lessons.every((l) => typeof l?.start === 'string' && l.start)

  return {
    version: DATA_VERSION,
    subjects: lessonsUsable && Array.isArray(raw.subjects) ? raw.subjects : base.subjects,
    lessons: lessonsUsable ? raw.lessons! : base.lessons,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    settings: {
      anchorMonday: raw.settings?.anchorMonday || base.settings.anchorMonday,
    },
  }
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalize(JSON.parse(raw))
  } catch {
    // Приватный режим или битый JSON — откатываемся к расписанию по умолчанию, а не падаем.
  }
  return freshData()
}

function persist(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Переполнение или запрет записи — молча продолжаем в памяти.
  }
}

let state: AppData = load()
// Закрепляем результат миграции сразу, чтобы не прогонять её при каждом запуске.
persist(state)

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getState(): AppData {
  return state
}

function commit(next: AppData): void {
  state = next
  persist(state)
  listeners.forEach((l) => l())
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getState, getState)
}

// --- задания ---------------------------------------------------------------

export function addTask(input: {
  subjectId: string
  title: string
  note?: string
  due: string
}): Task {
  const stamp = now()
  const task: Task = {
    id: uid(),
    subjectId: input.subjectId,
    title: input.title.trim(),
    note: input.note?.trim() || undefined,
    due: input.due,
    done: false,
    createdAt: stamp,
    updatedAt: stamp,
    authorId: deviceId(),
  }
  commit({ ...state, tasks: [...state.tasks, task] })
  return task
}

export function updateTask(id: string, patch: Partial<Omit<Task, 'id'>>): void {
  commit({
    ...state,
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now() } : t)),
  })
}

export function toggleTask(id: string): void {
  const task = state.tasks.find((t) => t.id === id)
  if (!task) return
  updateTask(id, { done: !task.done, doneAt: task.done ? undefined : now() })
}

export function deleteTask(id: string): void {
  commit({ ...state, tasks: state.tasks.filter((t) => t.id !== id) })
}

// --- предметы --------------------------------------------------------------

export function addSubject(input: { name: string; short?: string; color: string }): Subject {
  const subject: Subject = { id: uid(), ...input, updatedAt: now() }
  commit({ ...state, subjects: [...state.subjects, subject] })
  return subject
}

export function updateSubject(id: string, patch: Partial<Omit<Subject, 'id'>>): void {
  commit({
    ...state,
    subjects: state.subjects.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: now() } : s)),
  })
}

/** Удаляет предмет вместе с его парами и заданиями — иначе останутся висеть сироты. */
export function deleteSubject(id: string): void {
  commit({
    ...state,
    subjects: state.subjects.filter((s) => s.id !== id),
    lessons: state.lessons.filter((l) => l.subjectId !== id),
    tasks: state.tasks.filter((t) => t.subjectId !== id),
  })
}

// --- расписание ------------------------------------------------------------

export function addLesson(input: Omit<Lesson, 'id' | 'updatedAt'>): Lesson {
  const lesson: Lesson = { id: uid(), ...input, updatedAt: now() }
  commit({ ...state, lessons: [...state.lessons, lesson] })
  return lesson
}

export function updateLesson(id: string, patch: Partial<Omit<Lesson, 'id'>>): void {
  commit({
    ...state,
    lessons: state.lessons.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: now() } : l)),
  })
}

export function deleteLesson(id: string): void {
  commit({ ...state, lessons: state.lessons.filter((l) => l.id !== id) })
}

// --- настройки -------------------------------------------------------------

export function updateSettings(patch: Partial<Settings>): void {
  commit({ ...state, settings: { ...state.settings, ...patch } })
}

/** Объявить текущую неделю числителем — переставляет якорь чётности. */
export function setThisWeekAsNumerator(): void {
  updateSettings({ anchorMonday: mondayOf(todayISO()) })
}

// --- резервная копия -------------------------------------------------------

export function exportJSON(): string {
  return JSON.stringify(state, null, 2)
}

export function importJSON(text: string): void {
  commit(normalize(JSON.parse(text)))
}

/** Стереть задания, но сохранить расписание — для начала нового семестра. */
export function clearTasks(): void {
  commit({ ...state, tasks: [] })
}

/** Заменить расписание целиком — этим я залью твоё настоящее расписание с фото. */
export function replaceSchedule(subjects: Subject[], lessons: Lesson[]): void {
  commit({ ...state, subjects, lessons })
}
