import { useRef, useState } from 'react'
import { clearTasks, exportJSON, importJSON, useData } from '../store'
import { todayISO } from '../lib/dates'
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
