import { useEffect, useState } from 'react'
import { toISO } from '../src/lib/dates'
import { IS_DEMO, TODAY } from './data'

export const currentDay = () => IS_DEMO ? TODAY : toISO(new Date())

export function useToday() {
  const [today, setToday] = useState(currentDay)
  useEffect(() => {
    if (IS_DEMO) return
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      setToday(currentDay())
      clearTimeout(timer)
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50)
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
  return today
}
