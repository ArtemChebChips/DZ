declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

/** Версия и время сборки — показываются в настройках, чтобы сверять обновления. */
export const APP_VERSION = __APP_VERSION__
export const BUILD_TIME = __BUILD_TIME__

/** Чётность недели: числитель, знаменатель или «каждую неделю». */
export type WeekParity = 'num' | 'denom' | 'both'

export type LessonKind = 'lecture' | 'seminar' | 'lab' | 'other'

/** Чем заканчивается предмет — от этого зависит его цвет в интерфейсе. */
export type Assessment = 'exam' | 'dist' | 'credit' | 'other'

/** Понедельник = 1 ... суббота = 6. Воскресенья в расписании не бывает. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6

export type Subject = {
  id: string
  name: string
  /** Короткое имя для узких мест вроде клеток календаря. */
  short?: string
  assessment: Assessment
  updatedAt: string
}

/**
 * Слот расписания — не конкретная пара, а правило «по вторникам в 11:50, числитель».
 * Время хранится у каждой пары: единой сетки звонков в расписании нет,
 * занятия начинаются и в 08:30, и в 09:50, и в 12:25.
 */
export type Lesson = {
  id: string
  subjectId: string
  weekday: Weekday
  /** 'HH:MM', по нему же идёт сортировка внутри дня. */
  start: string
  end: string
  parity: WeekParity
  /** Аудитория или кафедра: '301х', 'каф. ФН4'. */
  room?: string
  /** Корпус: 'В1 ХимЛаб'. */
  building?: string
  /** Преподаватель у пары, а не у предмета: у лекции и лабы они разные. */
  teacher?: string
  kind: LessonKind
  updatedAt: string
}

export type Task = {
  id: string
  subjectId: string
  title: string
  note?: string
  /** К какому дню сдать, 'YYYY-MM-DD'. */
  due: string
  done: boolean
  createdAt: string
  doneAt?: string
  updatedAt: string
  /** Под будущую общую базу с одногруппниками: кто добавил задание. */
  authorId?: string
}

export type Settings = {
  /** Понедельник недели, которая точно числитель. От него считается вся чётность. */
  anchorMonday: string
  /** Выполненное остаётся в списке зачёркнутым, а не исчезает сразу. */
  keepDoneVisible: boolean
}

export type AppData = {
  version: number
  subjects: Subject[]
  lessons: Lesson[]
  tasks: Task[]
  settings: Settings
}
