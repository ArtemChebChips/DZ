import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { inlineStartup } from '../scripts/inline-startup.ts'

const html = '<head><script type="module" crossorigin src="./assets/app.js"></script><link rel="stylesheet" crossorigin href="./assets/app.css"></head><body></body>'
const files = ['index.html', 'assets/app.js', 'assets/app.css']
test('Стартовый HTML содержит код и стили без отдельных загрузок и безопасно экранирует границы', () => {
  const output = inlineStartup(html, files, file => file.endsWith('.js') ? 'globalThis.value="</script><!--"' : 'a::after{content:"</style>"}')
  assert(!output.includes(' src='))
  assert(!output.includes('<link'))
  assert.equal((output.match(/<\/script>/g) || []).length, 1)
  assert.equal((output.match(/<\/style>/g) || []).length, 1)
  const context = {}
  vm.runInNewContext(output.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1], context)
  assert.equal(context.value, '</script><!--')
  assert(output.includes('data-startup-source="./assets/app.js"'))
})
test('Изменение схемы сборки не публикует молча страницу с внешними chunks', () => {
  assert.throws(() => inlineStartup(html, [...files, 'assets/second.js'], () => ''), /один JS/)
  assert.throws(() => inlineStartup(html.replace('app.js', 'missing.js'), files, () => ''), /Неожиданный вход/)
  assert.throws(() => inlineStartup('<html></html>', files, () => ''), /Не удалось встроить/)
})
