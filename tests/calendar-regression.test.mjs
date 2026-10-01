import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, diffDays, mondayOf, parseISO, toISO, weekdayOf, humanDue, minutesBetween } from '../src/lib/dates.ts'
import { lessonsOn, nextLessonDates, parityOf } from '../src/lib/week.ts'
import { ANCHOR_MONDAY, DEFAULT_LESSONS, DEFAULT_SUBJECTS } from '../src/data/schedule.ts'
import { academicWeek } from '../design/academic-week.ts'
import { taskGroups } from '../design/task-groups.ts'
import { lessonBreaks } from '../design/breaks.ts'
import { taskLesson } from '../design/homework.ts'
import { generateTestTasks, withoutTestTasks } from '../design/test-tasks.ts'
import { validDate, readNotebook, STORAGE_KEY } from '../design/storage.ts'
import { gestureAxis } from '../design/swipe.ts'

test('Общий порог оси свайпа учитывает дрожание, доминанту и обе стороны', () => {
  for (const [x, y] of [[0, 7], [9, 9], [-9, 0], [0, -9]]) assert.equal(gestureAxis(x, y), null)
  for (const [x, y] of [[10, 0], [-10, 0], [14, 10], [-14, -10], [220, 20]]) assert.equal(gestureAxis(x, y), 'x')
  for (const [x, y] of [[0, 10], [10, 10], [13, 10], [-13, -10], [20, 220]]) assert.equal(gestureAxis(x, y), 'y')
})

test('Пустой существующий ключ считается повреждением, исходная запись сохраняется', () => {
  const values = new Map([[STORAGE_KEY, '']])
  assert.throws(() => readNotebook({ getItem: key => values.get(key) ?? null }))
  assert.equal(values.get(STORAGE_KEY), '')
})

test('Валидные годы 0000–0100 имеют тот же календарный смысл в storage и Date', () => {
  for (const value of ['0000-02-29', '0001-01-01', '0099-12-31', '0100-01-01', '0999-12-31']) {
    assert.equal(validDate(value), true)
    assert.equal(toISO(parseISO(value)), value)
  }
  const preceding = addDays('0000-01-01', -1)
  assert.equal(preceding, '-000001-12-31')
  assert.equal(toISO(parseISO(preceding)), preceding)
  assert.equal(addDays(preceding, 1), '0000-01-01')
  const monday = mondayOf('0000-01-01')
  assert.equal(weekdayOf(monday), 1)
  assert.equal(toISO(parseISO(monday)), monday)
  assert.equal(diffDays(monday, '0000-01-01'), weekdayOf('0000-01-01') - 1)
})

test('Локальные даты и количество дней сохраняются на обеих границах DST и в отрицательном поясе', () => {
  const previous = process.env.TZ
  try {
    process.env.TZ = 'America/New_York'
    for (const [start, end, distance] of [['2026-03-07', '2026-03-09', 2], ['2026-10-31', '2026-11-02', 2], ['2024-02-28', '2024-03-01', 2]]) {
      assert.equal(diffDays(start, end), distance)
      assert.equal(diffDays(end, start), -distance)
      assert.equal(addDays(start, distance), end)
      assert.equal(toISO(parseISO(start)), start)
    }
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('Чётность до якоря, високосный день, воскресенье и Новый год не сбивают учебные недели', () => {
  assert.equal(parityOf('2026-08-24', ANCHOR_MONDAY), 'denom')
  assert.equal(parityOf('2026-08-17', ANCHOR_MONDAY), 'num')
  assert.equal(mondayOf('2026-09-06'), '2026-08-31')
  assert.equal(weekdayOf('2026-09-06'), 7)
  assert.equal(parityOf('2027-01-01', ANCHOR_MONDAY), 'denom')
  assert.equal(parityOf('2027-01-04', ANCHOR_MONDAY), 'num')
  assert.equal(parityOf('2024-02-29', '2024-02-26'), 'num')
  assert.equal(parityOf('2024-03-04', '2024-02-26'), 'denom')
  assert.equal(academicWeek('2024-03-03', '2024-02-26'), 1)
  assert.equal(academicWeek('2024-03-04', '2024-02-26'), 2)
})

test('Настоящее расписание целостно: уникальные ID, предметы, времена и чередование физики', () => {
  assert.equal(DEFAULT_SUBJECTS.length, 11)
  assert.equal(DEFAULT_LESSONS.length, 28)
  assert.equal(new Set(DEFAULT_SUBJECTS.map(s => s.id)).size, 11)
  assert.equal(new Set(DEFAULT_LESSONS.map(l => l.id)).size, 28)
  const ids = new Set(DEFAULT_SUBJECTS.map(s => s.id))
  for (const lesson of DEFAULT_LESSONS) {
    assert(ids.has(lesson.subjectId), lesson.id)
    assert.match(lesson.start, /^(?:[01]\d|2[0-3]):[0-5]\d$/)
    assert.match(lesson.end, /^(?:[01]\d|2[0-3]):[0-5]\d$/)
    assert(lesson.end > lesson.start, lesson.id)
    assert(lesson.weekday >= 1 && lesson.weekday <= 6, lesson.id)
  }
  assert.deepEqual(lessonsOn('2026-08-31', DEFAULT_LESSONS, ANCHOR_MONDAY).map(l => l.id), ['pn-2', 'pn-3', 'pn-5'])
  assert.deepEqual(lessonsOn('2026-09-07', DEFAULT_LESSONS, ANCHOR_MONDAY).map(l => l.id), ['pn-1', 'pn-2', 'pn-4'])
  assert.deepEqual(lessonsOn('2026-09-06', DEFAULT_LESSONS, ANCHOR_MONDAY), [])
  assert.equal(minutesBetween('08:30', '15:35'), 425)
})

test('Ближайшие даты различают вид, включение сегодня и две пары в один день', () => {
  assert.deepEqual(nextLessonDates('phys', '2026-09-28', DEFAULT_LESSONS, ANCHOR_MONDAY, 2, { kind: 'lab' }), ['2026-10-12', '2026-10-26'])
  assert.deepEqual(nextLessonDates('phys', '2026-09-28', DEFAULT_LESSONS, ANCHOR_MONDAY, 2, { inclusive: true, kind: 'lab' }), ['2026-09-28', '2026-10-12'])
  assert.deepEqual(nextLessonDates('phys', '2026-09-21', DEFAULT_LESSONS, ANCHOR_MONDAY, 2, { kind: 'seminar' }), ['2026-10-05', '2026-10-19'])
  assert.deepEqual(nextLessonDates('missing', '2026-09-21', DEFAULT_LESSONS, ANCHOR_MONDAY), [])
  assert.deepEqual(nextLessonDates('phys', '2026-09-21', DEFAULT_LESSONS, ANCHOR_MONDAY, 0), [])
})

test('Ближайшие даты всегда соответствуют реальной паре; поиск и сортировка не меняют расписание', () => {
  const before = structuredClone(DEFAULT_LESSONS)
  for (const subject of DEFAULT_SUBJECTS) {
    for (const kind of ['lecture', 'seminar', 'lab', 'other']) {
      const dates = nextLessonDates(subject.id, '2026-12-29', DEFAULT_LESSONS, ANCHOR_MONDAY, 3, { kind })
      assert.equal(new Set(dates).size, dates.length)
      assert.deepEqual([...dates].sort(), dates)
      for (const date of dates) assert(lessonsOn(date, DEFAULT_LESSONS, ANCHOR_MONDAY).some(l => l.subjectId === subject.id && l.kind === kind))
    }
  }
  assert.deepEqual(DEFAULT_LESSONS, before)
})

test('Группировка через Новый год и високосный февраль не теряет сроки или записи', () => {
  for (const today of ['2026-12-31', '2027-01-02', '2024-02-29']) {
    const tasks = Array.from({ length: 22 }, (_, i) => ({ id: String(i), due: addDays(today, i - 4) })).reverse()
    const before = structuredClone(tasks)
    const result = taskGroups(tasks, today).groups.flatMap(g => g.tasks)
    assert.equal(result.length, tasks.length)
    assert.equal(new Set(result.map(t => t.id)).size, tasks.length)
    assert.deepEqual(tasks, before)
    assert.equal(taskGroups(tasks, today).groups.find(g => g.id === 'tomorrow').tasks[0].due, addDays(today, 1))
  }
  assert.equal(humanDue('2027-01-01', '2026-12-31'), 'завтра')
  assert.equal(humanDue('2024-03-01', '2024-02-28'), 'послезавтра')
})

test('Вторая лабораторная не получает ту же задачу повторно; длинный ВУЦ не создаёт ложного перерыва', () => {
  const lessons = lessonsOn('2026-09-28', DEFAULT_LESSONS, ANCHOR_MONDAY)
  const secondLab = { subjectId: 'phys', entryType: 'homework', kind: 'lab', lessonId: 'pn-5' }
  assert.equal(lessons.filter(l => taskLesson(secondLab, lessons)?.id === l.id).length, 1)
  assert.equal(taskLesson(secondLab, lessons)?.start, '17:35')
  assert.equal(lessonBreaks(lessonsOn('2026-10-01', DEFAULT_LESSONS, ANCHOR_MONDAY)).size, 0)
})

test('Генератор на пустых/коротких неделях остаётся ограниченным и удаляет только помеченные примеры', () => {
  assert.deepEqual(generateTestTasks([], 'empty'), [])
  const days = Array.from({ length: 3 }, (_, i) => ({ date: addDays('2026-10-01', i), lessons: [] }))
  const before = structuredClone(days)
  const generated = generateTestTasks(days, 'short', () => 0)
  assert.equal(generated.length, 1)
  assert.equal(generated[0].entryType, 'note')
  assert.equal(generated[0].due, '2026-10-03')
  assert.deepEqual(days, before)
  const personal = { ...generated[0], id: 'short-personal', testBatchId: undefined }
  assert.deepEqual(withoutTestTasks([personal, ...generated]), [personal])
})
