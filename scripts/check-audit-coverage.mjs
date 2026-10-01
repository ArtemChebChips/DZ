// Проверяет сохранённый объём аудита; изменение файла требует нового просмотра.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const ledger = JSON.parse(readFileSync(resolve(root, 'audit/coverage.json'), 'utf8'))
const records = new Map(ledger.files.map(file => [file.path, file]))
assert.equal(records.size, ledger.files.length, 'В журнале повторяются файлы')
const current = readdirSync(resolve(root, 'design'), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(tsx?|css|html|webmanifest|js)$/.test(entry.name))
  .map(entry => resolve(entry.parentPath, entry.name).slice(root.length))
for (const file of current) {
  const record = records.get(file)
  assert(record?.readComplete, `Не просмотрен актуальный исходник: ${file}`)
}
const seen = new Set(), queue = [...current]
while (queue.length) {
  const file = queue.pop()
  if (seen.has(file)) continue
  seen.add(file)
  const source = readFileSync(resolve(root, file), 'utf8')
  for (const match of source.matchAll(/\b(?:from|import)\s*['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue
    const target = resolve(root, dirname(file), match[1])
    const found = [target, ...['.ts', '.tsx', '.css', '.json'].map(ext => target + ext)].find(existsSync)
    assert(found, `Не найден относительный импорт: ${file} → ${match[1]}`)
    const dependency = found.slice(root.length)
    assert(records.get(dependency)?.readComplete, `Не просмотрен импорт: ${file} → ${dependency}`)
    queue.push(dependency)
  }
}
for (const record of ledger.files.filter(file => file.readComplete)) {
  const hash = createHash('sha256').update(readFileSync(resolve(root, record.path))).digest('hex')
  assert.equal(hash, record.reviewedSha256, `После аудита изменился файл: ${record.path}`)
}
console.log(`Журнал согласован: ${ledger.baselineFileCount} файлов исходной базы; ${current.length} файлов текущего design и ${seen.size} файлов с импортами проверены чтением. Физическая приёмка отдельно.`)
