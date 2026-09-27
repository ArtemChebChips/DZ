import { useEffect, useRef, useState } from 'react'

export function FrameMeter() {
  const [running, setRunning] = useState(false)
  const [fps, setFps] = useState<number | null>(null)
  const dot = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!running) return
    let frame = 0, start = 0, previous = 0
    const intervals: number[] = []
    const tick = (time: number) => {
      if (!start) start = time
      if (previous && time - start > 200) intervals.push(time - previous)
      previous = time
      if (dot.current) dot.current.style.transform = `translateX(${(Math.sin((time - start) / 250) + 1) * 90}px)`
      if (time - start < 2000) frame = requestAnimationFrame(tick)
      else {
        intervals.sort((a, b) => a - b)
        setFps(Math.round(1000 / intervals[Math.floor(intervals.length / 2)]))
        setRunning(false)
      }
    }
    frame = requestAnimationFrame(tick)
    const stop = () => { if (document.hidden) { setRunning(false); setFps(null) } }
    document.addEventListener('visibilitychange', stop)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', stop) }
  }, [running])
  return <div className="frame-meter"><button className="outline-button" disabled={running} onClick={() => { setFps(null); setRunning(true) }}>{running ? 'Измеряем…' : 'Проверить частоту анимации'}</button>{running && <div className="frame-track" aria-hidden="true"><span ref={dot} /></div>}<p role="status">{fps ? `Сейчас примерно ${fps} кадр/с.` : 'Используется частота, доступная браузеру — без ограничения приложения в 60 кадр/с.'}</p></div>
}
