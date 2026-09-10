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

/**
 * Панель нарочно висит капсулой, а не прижата к краю: на iPhone окно
 * приложения короче экрана, и упереть её в нижнюю границу невозможно.
 * Плавающая форма превращает этот зазор в поле вокруг панели.
 */
export function BottomNav({ route }: { route: Route }) {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.match.includes(route.name)),
  )

  return (
    <nav className="shrink-0 px-3 pb-2 pt-1">
      <div className="relative flex max-w-lg mx-auto bg-bar border border-line rounded-2xl p-1 shadow-lg shadow-black/10">
        {/* Подложка активной вкладки: переезжает, а не перекрашивается. */}
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-1 rounded-xl bg-accent/15 transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ width: 'calc((100% - 0.5rem) / 3)', transform: `translateX(${activeIndex * 100}%)` }}
        />

        {TABS.map((tab) => {
          const active = tab.match.includes(route.name)
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.to())}
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-1.5 transition-colors ${
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
