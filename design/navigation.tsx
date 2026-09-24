import { useLayoutEffect, useRef, useState } from 'react'
import { IconList, IconCalendar, IconSettings } from '../src/components/icons'
import { version } from '../package.json'

type Tab = 'tasks' | 'schedule' | 'settings'
const tabs = [
  { key: 'tasks', label: 'Задачи', icon: IconList },
  { key: 'schedule', label: 'Расписание', icon: IconCalendar },
  { key: 'settings', label: 'Настройки', icon: IconSettings },
] as const

export function Navigation({ tab, changeTab }: { tab: Tab; changeTab: (tab: Tab) => void }) {
  const ref = useRef<HTMLElement>(null)
  const [bubble, setBubble] = useState({ x: 0, y: 0, width: 0, height: 0 })
  useLayoutEffect(() => {
    const nav = ref.current!
    const measure = () => {
      const button = nav.querySelector<HTMLButtonElement>('[aria-current="page"]')!
      setBubble({ x: button.offsetLeft + 6, y: button.offsetTop + 2, width: button.offsetWidth - 12, height: button.offsetHeight - 4 })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [tab])
  return <nav ref={ref} className="app-nav" aria-label="Основные вкладки">
    <span className="desktop-brand">ДЗ<span>Учебный планер</span></span>
    <span className="nav-bubble" aria-hidden="true" style={{ transform: `translate(${bubble.x}px, ${bubble.y}px)`, width: bubble.width, height: bubble.height, visibility: bubble.width ? 'visible' : 'hidden' }} />
    {tabs.map(item => <button key={item.key} aria-current={tab === item.key ? 'page' : undefined} onClick={() => changeTab(item.key)}><item.icon size={25} /><span>{item.label}</span></button>)}
    <span className="desktop-footer">Версия {version}</span>
  </nav>
}
