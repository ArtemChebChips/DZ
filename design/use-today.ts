import { useEffect, useState } from 'react'
import { toISO } from '../src/lib/dates'
import { IS_DEMO, TODAY } from './data'

// Живые часы демо нужны только для изолированной проверки границ и полуночи.
const fixedDemo = IS_DEMO && new URLSearchParams(location.search).get('clock') !== 'live'
export const currentMoment = () => fixedDemo ? new Date(TODAY + 'T14:30:00') : new Date()
export const currentDay = () => toISO(currentMoment())

export function useScheduleClock() {
  const [now, setNow] = useState(currentMoment)
  useEffect(() => {
    if (fixedDemo) return
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      setNow(currentMoment())
      clearTimeout(timer)
      const now = new Date()
      timer = setTimeout(refresh, 60_000 - now.getSeconds() * 1000 - now.getMilliseconds() + 20)
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return now
}
