import { navigate, routes, type Route } from '../lib/router'
import { IconCalendar, IconList, IconSettings } from './icons'

const TABS = [
  { path: routes.tasks, label: 'Главное', icon: IconList, match: ['tasks'] },
  { path: routes.calendar, label: 'Календарь', icon: IconCalendar, match: ['calendar', 'day'] },
  { path: routes.settings, label: 'Настройки', icon: IconSettings, match: ['settings', 'schedule', 'subjects'] },
]

export function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      <div className="nav-tabs">
        {TABS.map((tab) => {
          const active = tab.match.includes(route.name)
          const Icon = tab.icon
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              className="nav-tab"
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={22} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
