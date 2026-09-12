import { useCallback, useState } from 'react'

const KEY = 'dz:collapsed'

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/**
 * Какие блоки свёрнуты. Живёт отдельно от данных приложения: это состояние
 * интерфейса, его незачем тащить в резервную копию.
 */
export function useCollapsed() {
  const [keys, setKeys] = useState<string[]>(read)

  const toggle = useCallback((key: string) => {
    setKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Не смогли запомнить — свёрнутость просто не переживёт перезапуск.
      }
      return next
    })
  }, [])

  return { isCollapsed: (key: string) => keys.includes(key), toggle }
}
