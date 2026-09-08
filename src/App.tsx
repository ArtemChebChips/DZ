import { useRoute } from './lib/router'
import { BottomNav } from './components/BottomNav'
import { TasksScreen } from './screens/TasksScreen'
import { CalendarScreen } from './screens/CalendarScreen'
import { DayScreen } from './screens/DayScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ScheduleScreen } from './screens/ScheduleScreen'
import { SubjectsScreen } from './screens/SubjectsScreen'
import { UpdateNotice } from './components/UpdateNotice'

export default function App() {
  const route = useRoute()

  return (
    <div className="app-shell">
      {route.name === 'tasks' ? <TasksScreen /> : null}
      {route.name === 'calendar' ? <CalendarScreen /> : null}
      {/* key заставляет экран дня пересобраться при переходе между датами */}
      {route.name === 'day' ? <DayScreen key={route.date} date={route.date} /> : null}
      {route.name === 'settings' ? <SettingsScreen /> : null}
      {route.name === 'schedule' ? <ScheduleScreen /> : null}
      {route.name === 'subjects' ? <SubjectsScreen /> : null}
      <BottomNav route={route} />
      <UpdateNotice />
    </div>
  )
}
