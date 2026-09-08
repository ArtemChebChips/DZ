import { useRef, useState } from 'react'
import { clearTasks, exportJSON, importJSON, seedDemoTasks, useData } from '../store'
import { todayISO } from '../lib/dates'
import { APP_VERSION, BUILD_TIME } from '../types'
import { navigate, routes } from '../lib/router'
import { setTheme, useTheme } from '../lib/theme'
import { Screen, Button, Toggle } from '../components/ui'
import { IconChevronRight } from '../components/icons'

function Row({
  title,
  hint,
  onClick,
}: {
  title: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2 transition"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[15px]">{title}</span>
        {hint ? <span className="block text-[12px] text-muted mt-0.5">{hint}</span> : null}
      </span>
      <IconChevronRight size={18} className="text-muted shrink-0" />
    </button>
  )
}

function Card({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <section className="mb-5">
      {title ? <h2 className="text-[13px] text-muted mb-2 px-1">{title}</h2> : null}
      <div className="bg-surface rounded-2xl border border-line overflow-hidden divide-y divide-line">
        {children}
      </div>
    </section>
  )
}

export function SettingsScreen() {
  const { subjects, lessons, tasks } = useData()
  const theme = useTheme()
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  function download() {
    const blob = new Blob([exportJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dz-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Сносит кеш и регистрацию service worker — лечит залипшую старую версию. */
  async function hardReload() {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      await Promise.all((regs ?? []).map((r) => r.unregister()))
      const keys = await caches?.keys?.()
      await Promise.all((keys ?? []).map((k) => caches.delete(k)))
    } catch {
      // Даже если что-то не удалось снести, перезагрузка всё равно полезна.
    }
    location.reload()
  }

  async function upload(file: File) {
    try {
      importJSON(await file.text())
      setMessage('Данные загружены')
    } catch {
      setMessage('Не получилось прочитать файл')
    }
    setTimeout(() => setMessage(''), 3000)
  }

  return (
    <Screen title="Настройки">
      {/* Версия нужна, чтобы на телефоне сразу видеть, приехало ли обновление. */}
      <p className="text-[11px] text-muted text-center -mt-1 mb-3">
        версия {APP_VERSION} · сборка {BUILD_TIME}
      </p>

      <Card title="Оформление">
        <Toggle
          label="Ночная тема"
          hint="Тёмный спокойный вариант"
          checked={theme === 'night'}
          onChange={(on) => setTheme(on ? 'night' : 'quiet')}
        />
        <Toggle
          label="Режим сдвгшника"
          hint="Кислотный жёлтый, чёрные обводки, всё орёт"
          checked={theme === 'adhd'}
          onChange={(on) => setTheme(on ? 'adhd' : 'quiet')}
        />
      </Card>

      <Card title="Расписание">
        <Row
          title="Пары"
          hint={`${lessons.length} в расписании`}
          onClick={() => navigate(routes.schedule)}
        />
        <Row
          title="Предметы"
          hint={`${subjects.length} ${subjects.length === 1 ? 'предмет' : 'шт.'}`}
          onClick={() => navigate(routes.subjects)}
        />
      </Card>

      <Card title="Резервная копия">
        <div className="px-4 py-3.5">
          <p className="text-[12px] text-muted mb-3">
            Данные хранятся только на этом устройстве. Файл можно скинуть себе на другой телефон или другу.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={download} className="flex-1">
              Выгрузить
            </Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()} className="flex-1">
              Загрузить
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ''
            }}
          />
          {message ? <p className="text-[12px] text-accent mt-2">{message}</p> : null}
        </div>
      </Card>

      <Card title="Обновление">
        <div className="px-4 py-3.5">
          <p className="text-[12px] text-muted mb-3">
            Обычно новая версия приезжает сама. Если кажется, что приложение застряло на
            старой — нажми, оно перезагрузится начисто. Задания не пострадают.
          </p>
          <Button variant="ghost" onClick={hardReload} className="w-full">
            Обновить приложение
          </Button>
        </div>
      </Card>

      <Card title="Пока тестируем">
        <div className="px-4 py-3.5">
          <p className="text-[12px] text-muted mb-3">
            Добавит десяток заданий на разные сроки, чтобы посмотреть, как выглядит список.
            Кнопка временная — уберём, когда наиграешься.
          </p>
          <Button variant="ghost" onClick={seedDemoTasks} className="w-full">
            Накидать примеры заданий
          </Button>
        </div>
      </Card>

      <Card title="Опасная зона">
        <div className="px-4 py-3.5">
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              if (confirm(`Удалить все задания (${tasks.length})? Расписание останется.`)) clearTasks()
            }}
          >
            Удалить все задания
          </Button>
        </div>
      </Card>
    </Screen>
  )
}
