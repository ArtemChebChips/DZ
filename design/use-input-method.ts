import { useLayoutEffect } from 'react'

export function useInputMethod() {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.input = 'pointer'
    const pointer = () => { root.dataset.input = 'pointer' }
    const keyboard = (event: KeyboardEvent) => {
      if (['Tab', 'Enter', ' ', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) root.dataset.input = 'keyboard'
    }
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('touchstart', pointer, { capture: true, passive: true })
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('touchstart', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
    }
  }, [])
}
