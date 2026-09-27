import test from 'node:test'
import assert from 'node:assert/strict'
import { taskGroups } from '../design/task-groups.ts'
import { academicWeek } from '../design/academic-week.ts'

const groups = (today, dates) => taskGroups(dates.map(due => ({due})), today).groups.map(g => [g.id, g.tasks.map(t => t.due)])
test('Сегодня уже просрочено; завтра отдельно без дублирования', () => {
 assert.deepEqual(groups('2026-09-28', ['2026-10-05','2026-09-30','2026-09-28','2026-09-27','2026-09-29']), [
  ['overdue',['2026-09-27','2026-09-28']], ['tomorrow',['2026-09-29']], ['current',['2026-09-30']], ['later',['2026-10-05']],
 ])
})
test('Пятница, суббота и воскресенье: учебная неделя переключается с субботы', () => {
 const dates=['2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-11','2026-10-12']
 assert.equal(taskGroups([], '2026-10-02').start,'2026-09-28')
 assert.equal(taskGroups([], '2026-10-03').start,'2026-10-05')
 assert.deepEqual(groups('2026-10-03', dates), [['overdue',dates.slice(0,2)],['tomorrow',['2026-10-04']],['current',dates.slice(3,6)],['later',['2026-10-12']]])
 assert.deepEqual(groups('2026-10-04',dates),[['overdue',dates.slice(0,3)],['tomorrow',['2026-10-05']],['current',dates.slice(4,6)],['later',['2026-10-12']]])
})
test('Пустые группы скрыты, ручные воскресные сроки и исходные данные сохранены', () => {
 const tasks=[{id:'sunday',due:'2026-10-04'},{id:'friday',due:'2026-10-02'}], before=structuredClone(tasks)
 assert.equal(taskGroups(tasks,'2026-09-30').groups.flatMap(g=>g.tasks).length,2)
 assert.deepEqual(tasks,before)
 assert.deepEqual(taskGroups([],'2026-12-31').groups,[])
 assert.equal(taskGroups([],'2027-01-02').start,'2027-01-04')
})
test('Учебные номера не сбрасываются на границе месяцев и года', () => {
 const anchor='2026-08-31'
 assert.equal(academicWeek('2026-08-30',anchor),null)
 assert.equal(academicWeek('2026-09-06',anchor),1)
 assert.equal(academicWeek('2026-09-28',anchor),5)
 assert.equal(academicWeek('2027-01-03',anchor),18)
 assert.equal(academicWeek('2027-01-04',anchor),19)
})
