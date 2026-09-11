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
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.match.includes(route.name)),
  )

  return (
    <nav className="absolute z-30 inset-x-0 bottom-0 px-3 pointer-events-none safe-bottom">
      {/* Панель — пузырь, оторванный от краёв экрана, как в Telegram. */}
      <div className="pointer-events-auto relative flex max-w-lg mx-auto rounded-full bg-surface border border-line p-1 shadow-lg shadow-black/20">
        {/* Подложка активной вкладки переезжает, а не перекрашивается. */}
        <span
          aria-hidden
          className="absolute z-0 top-1 bottom-1 rounded-full bg-surface-2 transition-[left] duration-300 ease-out motion-reduce:transition-none"
          style={{
            width: `calc((100% - 0.5rem) / ${TABS.length})`,
            left: `calc(0.25rem + ${activeIndex} * (100% - 0.5rem) / ${TABS.length})`,
          }}
        />

        {TABS.map((tab) => {
          const active = tab.match.includes(route.name)
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.to())}
              className={`relative z-10 flex-1 flex flex-col items-center gap-0.5 py-2 rounded-full transition-colors ${
                active ? 'text-ink' : 'text-muted'
              }`}
            >
              <Icon size={26} />
              <span className="text-[11px]">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
