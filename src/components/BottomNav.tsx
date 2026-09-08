import { navigate, routes, type Route } from '../lib/router'
import { todayISO } from '../lib/dates'
import { IconCalendar, IconList, IconSettings } from './icons'

/**
 * Вкладка «День» всегда открывает сегодняшний день — заодно это и способ
 * вернуться к сегодня, если улистал далеко вперёд или назад.
 * Месяц спрятан за тапом по дате в шапке экрана дня.
 */
const TABS = [
  { key: 'tasks', to: () => routes.tasks, label: 'Задачи', icon: IconList, match: ['tasks'] },
  { key: 'day', to: () => routes.day(todayISO()), label: 'День', icon: IconCalendar, match: ['day', 'calendar'] },
  {
    key: 'settings',
    to: () => routes.settings,
    label: 'Настройки',
    icon: IconSettings,
    match: ['settings', 'schedule', 'subjects'],
  },
]

export function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="shrink-0 bg-bg border-t border-line safe-bottom">
      <div className="flex max-w-lg mx-auto">
        {TABS.map((tab) => {
          const active = tab.match.includes(route.name)
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.to())}
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
