// Небольшое приложение получает код и стили вместе с HTML, без второго
// прохода через загрузчик ресурсов на холодном офлайн-запуске.
export function inlineStartup(html: string, files: string[], read: (file: string) => string) {
  const scripts = files.filter(file => file.endsWith('.js'))
  const styles = files.filter(file => file.endsWith('.css'))
  if (scripts.length !== 1 || styles.length !== 1) throw new Error('Стартовая сборка ожидает один JS и один CSS; проверь новые chunks перед публикацией')
  const js = scripts[0], css = styles[0]
  let scriptCount = 0, styleCount = 0
  html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (tag, url: string) => {
    if (url !== `./${js}` || !tag.includes('type="module"')) throw new Error(`Неожиданный вход приложения: ${url}`)
    scriptCount++
    // Экранируем HTML-границы внутри JS, включая строковые литералы.
    const source = read(js).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
    return `<script type="module" data-startup-source="./${js}">${source}</script>`
  })
  html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, tag => {
    if (!tag.includes(`href="./${css}"`)) throw new Error('Неожиданная таблица стилей в стартовой странице')
    styleCount++
    return `<style data-startup-source="./${css}">${read(css).replace(/<\/style/gi, '<\\/style')}</style>`
  })
  if (scriptCount !== 1 || styleCount !== 1) throw new Error('Не удалось встроить стартовые JS/CSS в HTML')
  return html
}
