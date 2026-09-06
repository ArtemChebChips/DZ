import { navigate, routes, type Route } from '../lib/router'
import { IconCalendar, IconList, IconSettings } from './icons'

const TABS = [
  { path: routes.tasks, label: 'Задачи', icon: IconList, match: ['tasks'] },
  { path: routes.calendar, label: 'Календарь', icon: IconCalendar, match: ['calendar', 'day'] },
  { path: routes.settings, label: 'Настройки', icon: IconSettings, match: ['settings', 'schedule', 'subjects'] },
]

export function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-bg/90 backdrop-blur-lg border-t border-line safe-bottom">
      <div className="flex max-w-lg mx-auto">
        {TABS.map((tab) => {
          const active = tab.match.includes(route.name)
          const Icon = tab.icon
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1 transition ${
                active ? 'text-accent' : 'text-muted'
              }`}
            >
              <Icon size={22} />
              <span className="text-[11px]">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
