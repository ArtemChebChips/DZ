import { useEffect, useRef, useState } from 'react'
import { formatStartupReport, getStartupReport, markDuration, readStartupHistory, refreshStartupReport, startupHistoryUnavailable } from './startup'

export function StartupPanel() {
  const [report, setReport] = useState(getStartupReport)
  const [history] = useState(() => { try { return report.demo ? [] : readStartupHistory(localStorage) } catch { return [] } })
  const [notice, setNotice] = useState('')
  const text = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const refresh = () => setReport(getStartupReport())
    window.addEventListener('dz-startup-report', refresh)
    void refreshStartupReport()
    return () => window.removeEventListener('dz-startup-report', refresh)
  }, [])
  const output = formatStartupReport(report, history)
  const ms = (n: number | null | undefined) => n === undefined || n === null ? 'Нет замера' : `${Math.round(n)} мс`
  const copy = async () => {
    try { await navigator.clipboard.writeText(output); setNotice('Отчёт скопирован') }
    catch { text.current?.closest('details')?.setAttribute('open', ''); text.current?.focus(); text.current?.select(); setNotice('Скопируй выделенный отчёт вручную') }
  }
  return <div className="info-panel startup-panel">
    <p>Этот запуск: {new Date(report.startedAt).toLocaleString('ru-RU')}. Версия {report.version}.</p>
    <button className="primary-button" onClick={copy}>Скопировать отчёт</button>
    {notice && <p role="status">{notice}</p>}
    <p>Отсчёт начинается внутри браузера. Время от касания ярлыка до запуска браузера сюда может не попасть.</p>
    {(report.hiddenAtStart || report.hiddenBeforeFrame) && <p>Страница была скрыта во время запуска — это могло задержать кадр.</p>}
    {report.restoredFromBackForwardCache && <p>Страница восстановлена из памяти. Ниже — её первоначальный запуск.</p>}
    <dl className="startup-metrics">
      <div><dt>Первый байт страницы</dt><dd>{ms(report.navigation?.responseStart || null)}</dd></div>
      <div><dt>Начало кода страницы</dt><dd>{ms(report.marks.pageScript)}</dd></div>
      {report.marks.themeReadStart !== undefined && <><div><dt>Чтение темы</dt><dd>{ms(markDuration(report, 'themeReadStart', 'themeReadEnd'))}</dd></div>
      <div><dt>Разбор данных для темы</dt><dd>{ms(markDuration(report, 'themeReadEnd', 'themeParseEnd'))}</dd></div></>}
      <div><dt>Основной код готов</dt><dd>{ms(report.marks.mainModule)}</dd></div>
      <div><dt>Кадр стартовой оболочки, оценка</dt><dd>{ms(report.marks.shellFrameEstimate)}</dd></div>
      <div><dt>Чтение заданий и настроек</dt><dd>{ms(markDuration(report, 'notebookReadStart', 'notebookReadEnd'))}</dd></div>
      <div><dt>Проверка данных</dt><dd>{ms(markDuration(report, 'notebookReadEnd', 'notebookReady'))}</dd></div>
      <div><dt>Интерфейс построен</dt><dd>{ms(report.marks.interfaceCommit)}</dd></div>
      <div><dt>Первое содержимое приложения</dt><dd>{ms(report.paint['first-contentful-paint'])}</dd></div>
      <div><dt>Кадр после отрисовки, оценка</dt><dd>{ms(report.marks.frameEstimate)}</dd></div>
    </dl>
    <p className="binding-hint">«Чтение» и «проверка» — длительности этапов. Остальные числа — время от начала навигации. Перед чтением данных браузеру даётся возможность показать фон. Сам фон не считается первым содержимым. Оценки кадров не доказывают момент появления изображения на экране.</p>
    <p>Страница: {report.shell ? report.shell.source === 'cache' ? 'из офлайн-копии' : 'через сетевой запрос' : 'источник не определён браузером'}. Обработчик: {report.shell?.version || report.worker?.version || report.workerStatus}.</p>
    <dl className="startup-metrics">
      <div><dt>Начало кода обработчика</dt><dd>{ms(report.shell?.workerScriptStart)}</dd></div>
      <div><dt>Запрос страницы получен обработчиком</dt><dd>{ms(report.shell?.fetchEventStart)}</dd></div>
      <div><dt>Открытие офлайн-кэша, длительность</dt><dd>{ms(report.shell?.cacheOpenMs)}</dd></div>
      <div><dt>Поиск страницы в кэше, длительность</dt><dd>{ms(report.shell?.cacheMatchMs)}</dd></div>
      <div><dt>Чтение тела страницы, длительность</dt><dd>{ms(report.shell?.bodyReadMs)}</dd></div>
      <div><dt>Ответ обработчика подготовлен</dt><dd>{ms(report.shell?.responseReady)}</dd></div>
    </dl>
    <p className="binding-hint">Отметки обработчика приведены к шкале страницы. Отрицательное начало означает, что обработчик уже работал до этого запуска. {report.shell?.bodyMode === 'buffer' ? 'Тело страницы прочитано до подготовки ответа; затем браузер получает готовые байты.' : 'Передача и чтение тела страницы происходят после подготовки ответа.'}</p>
    {report.bundle === 'inline' && <p>Код и стили встроены в страницу. Отдельные запросы JS/CSS для запуска не нужны.</p>}
    <p>Копируется этот запуск и до четырёх предыдущих. Тексты заданий в отчёт не входят. Автоматической отправки нет.</p>
    {startupHistoryUnavailable() && <p role="status">Не удалось сохранить историю замеров. Текущий отчёт можно скопировать.</p>}
    <details><summary>Полный отчёт</summary><textarea ref={text} className="startup-report" aria-label="Отчёт о запуске" readOnly value={output} /></details>
  </div>
}
