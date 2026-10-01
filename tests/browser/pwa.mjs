// Only synthetic browser data. No deployment, personal storage, voice models or Claude.
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
const require = createRequire(import.meta.url)
const playwright = await import(process.env.DZ_PLAYWRIGHT_PATH ? pathToFileURL(require.resolve(process.env.DZ_PLAYWRIGHT_PATH)).href : 'playwright')
const { chromium } = playwright.chromium ? playwright : playwright.default
import { createServer } from 'node:http'
import { readFile, writeFile, readdir, mkdir, rm, cp, mkdtemp, symlink } from 'node:fs/promises'
import assert from 'node:assert/strict'
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const temporary = await mkdtemp(join(tmpdir(), 'dz-pwa-audit-'))
const baselineRevision = process.env.DZ_PWA_BASELINE ?? 'c218703'
const node = process.env.DZ_NODE_PATH ?? process.execPath
const env = { ...process.env, PATH: `${dirname(node)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` }
const vite = join(repository, 'node_modules/vite/bin/vite.js')
const baselineTree = join(temporary, 'baseline')
await mkdir(baselineTree)
const archive = execFileSync('git', ['archive', baselineRevision, 'design', 'src', 'vite.design.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.design.json'], { cwd: repository, maxBuffer: 20 * 1024 * 1024 })
const archivePath = join(temporary, 'baseline.tar')
await writeFile(archivePath, archive)
execFileSync('tar', ['-xf', archivePath, '-C', baselineTree])
await symlink(join(repository, 'node_modules'), join(baselineTree, 'node_modules'), 'dir')
execFileSync(node, [vite, 'build', '--config', 'vite.design.config.ts'], { cwd: baselineTree, env, stdio: 'pipe' })
const original = join(baselineTree, 'dist-design')
const fixed = join(temporary, 'v1')
execFileSync(node, [vite, 'build', '--config', 'vite.design.config.ts', '--outDir', fixed, '--emptyOutDir'], { cwd: repository, env, stdio: 'pipe' })
let base
let site = fixed, nextSite = fixed, delay = 0
function fixtureServer(folderFor, delayFor, requests = []) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const nested = url.pathname.startsWith('/next/')
    const path = nested ? url.pathname.slice(5) : url.pathname
    const file = path === '/' ? '/index.html' : path
    // Capture fixture and delay before async I/O: later phases cannot change
    // how an already accepted request is served.
    const folder = folderFor(nested)
    const requestDelay = delayFor()
    requests.push({ path: url.pathname, delayed: file === '/index.html' && requestDelay > 0 })
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', webmanifest: 'application/manifest+json' }
    try {
      const contents = await readFile(folder + file)
      const respond = () => { if (!res.destroyed) { res.writeHead(200, { 'Content-Type': types[file.split('.').pop()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(contents) } }
      if (requestDelay && file === '/index.html') {
        const timer = setTimeout(respond, requestDelay)
        res.once('close', () => clearTimeout(timer))
      } else respond()
    } catch { res.writeHead(404); res.end('missing') }
  })
}
const server = fixtureServer(nested => nested ? nextSite : site, () => delay)
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
base = `http://127.0.0.1:${server.address().port}`
const executablePath = process.env.DZ_CHROME_PATH || undefined
let browser
try { browser = await chromium.launch({ executablePath, headless: true }) }
catch (error) {
  await new Promise(resolve => server.close(resolve))
  await rm(temporary, { recursive: true, force: true })
  throw error
}
const persistentContexts = []
const results = { baselineSlowNetworkMs: [], fixedSlowNetworkMs: [], navigationSamples: [], checks: [] }
const launch = async (page, url = base + '/') => {
  const start = performance.now()
  await page.goto(url, { waitUntil: 'commit' })
  await page.locator('.bottom-nav, nav').first().waitFor()
  return Math.round(performance.now() - start)
}
async function controlled(page, url) {
  await launch(page, url)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
}
try {
  for (const [folder, field] of [[original, 'baselineSlowNetworkMs'], [fixed, 'fixedSlowNetworkMs']]) {
    // Baseline proof has its own origin and fixed directory, independent of
    // the mutable v1/v2/v3 security fixtures below.
    let phaseDelay = 0
    const requests = []
    const measurementServer = fixtureServer(() => folder, () => phaseDelay, requests)
    await new Promise((resolve, reject) => { measurementServer.once('error', reject); measurementServer.listen(0, '127.0.0.1', resolve) })
    const measurementURL = `http://127.0.0.1:${measurementServer.address().port}/`
    const context = await browser.newContext()
    try {
      let page = await context.newPage()
      await controlled(page, measurementURL)
      for (let i = 0; i < 3; i++) {
        await page.close()
        page = await context.newPage()
        phaseDelay = 8000
        const requestStart = requests.length
        const ms = await launch(page, measurementURL)
        phaseDelay = 0
        const timing = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0]
          return { workerStart: navigation.workerStart, responseStart: navigation.responseStart, controllerPath: navigator.serviceWorker.controller ? new URL(navigator.serviceWorker.controller.scriptURL).pathname : null }
        })
        const delayedRequests = requests.slice(requestStart).filter(request => request.delayed).length
        const sample = { phase: field, ms, ...timing, delayedRequests }
        results.navigationSamples.push(sample)
        results[field].push(ms)
        console.log(JSON.stringify(sample))
        assert(timing.workerStart > 0, `Navigation bypassed service worker: ${JSON.stringify(sample)}`)
        if (field === 'baselineSlowNetworkMs') assert(delayedRequests > 0, `Baseline did not reach delayed network: ${JSON.stringify(sample)}`)
        else assert.equal(delayedRequests, 0, `Current shell requested delayed HTML: ${JSON.stringify(sample)}`)
      }
    } finally {
      await context.close()
      await new Promise(resolve => measurementServer.close(resolve))
    }
  }
  console.log(JSON.stringify({ baselineSlowNetworkMs: results.baselineSlowNetworkMs, fixedSlowNetworkMs: results.fixedSlowNetworkMs }))
  assert(results.baselineSlowNetworkMs.every(ms => ms > 3400), `Baseline navigation delay not reproduced: ${JSON.stringify(results.baselineSlowNetworkMs)}`)
  assert(results.fixedSlowNetworkMs.every(ms => ms < 1000), `Fixed navigation exceeded threshold: ${JSON.stringify(results.fixedSlowNetworkMs)}`)
  site = fixed
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await controlled(page, base + '/?screen=tasks')
  await page.getByRole('button', { name: 'Задание', exact: true }).click()
  const textarea = page.getByRole('textbox').first()
  await textarea.fill('Открытый черновик версии 1')
  const oldAssets = await page.evaluate(() => [...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(el => el.src || el.href))
  await page.evaluate(() => { window.auditDocument = 'v1' })
  const next = await context.newPage()
  await controlled(next, base + '/next/?screen=tasks')
  const nextCaches = await next.evaluate(async () => (await caches.keys()).filter(name => name.startsWith(`dz-next-shell:${location.origin}/next/:`)))
  await next.evaluate(async () => { const cache = await caches.open('foreign-cache'); await cache.put('/foreign-sentinel', new Response('untouched')) })

  // Настоящие байты построенной v1, новый hash JS/HTML и новый build ID.
  const v2 = join(temporary, 'v2')
  await rm(v2, { recursive: true, force: true })
  await mkdir(v2 + '/assets', { recursive: true })
  const oldJS = (await readdir(fixed + '/assets')).find(name => name.endsWith('.js'))
  const newJS = oldJS.replace('.js', '-v2.js')
  for (const name of await readdir(fixed)) {
    if (name === 'assets') continue
    let data = await readFile(fixed + '/' + name)
    if (name === 'index.html') data = Buffer.from(data.toString().replace(oldJS, newJS))
    if (name === 'sw.js') data = Buffer.from(data.toString().replace(oldJS, newJS).replace(/const BUILD = '[^']+'|const BUILD = "[^"]+"/, 'const BUILD = "audit-v2"'))
    await writeFile(v2 + '/' + name, data)
  }
  for (const name of await readdir(fixed + '/assets')) await writeFile(v2 + '/assets/' + (name === oldJS ? newJS : name), await readFile(fixed + '/assets/' + name))
  site = v2
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration('/')).update() })
  await page.waitForFunction(async () => {
    const names = await caches.keys()
    return names.some(name => name.endsWith(':audit-v2')) && !(await navigator.serviceWorker.getRegistration('/')).installing
  })
  assert.equal(await textarea.inputValue(), 'Открытый черновик версии 1')
  assert.equal(await page.evaluate(() => window.auditDocument), 'v1')
  for (const asset of oldAssets) assert.equal(await page.evaluate(async url => (await fetch(url)).status, asset), 200)
  assert.equal(await page.evaluate(async () => !!await caches.match('/foreign-sentinel')), true)
  assert.deepEqual(await next.evaluate(async () => (await caches.keys()).filter(name => name.startsWith(`dz-next-shell:${location.origin}/next/:`))), nextCaches)
  assert.equal(await next.evaluate(() => navigator.serviceWorker.controller.scriptURL), base + '/next/sw.js')
  await next.reload()
  assert(!(await next.locator('script[type=module]').getAttribute('src')).includes('-v2.js'))
  results.checks.push({ name: 'v1-v2-preserves-draft-old-assets-and-next-scope', passed: true })
  const fresh = await context.newPage()
  await controlled(fresh, base + '/')
  const js = await fresh.locator('script[type=module]').getAttribute('src')
  assert(js.includes('-v2.js'))
  results.checks.push({ name: 'new-client-gets-complete-v2-shell', passed: true })
  const v3 = join(temporary, 'v3-failed')
  await rm(v3, { recursive: true, force: true })
  await cp(v2, v3, { recursive: true })
  const brokenSW = (await readFile(v3 + '/sw.js', 'utf8'))
    .replace('const BUILD = "audit-v2"', 'const BUILD = "audit-v3"')
    .replace('const FILES = [', 'const FILES = ["missing-required-asset.js",')
  await writeFile(v3 + '/sw.js', brokenSW)
  site = v3
  await fresh.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const found = new Promise(resolve => registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve() })
    }, { once: true }))
    await registration.update()
    await found
  })
  assert.equal(await fresh.evaluate(async () => (await caches.keys()).some(name => name.endsWith(':audit-v3'))), false)
  await fresh.reload()
  assert((await fresh.locator('script[type=module]').getAttribute('src')).includes('-v2.js'))
  assert.equal(await textarea.inputValue(), 'Открытый черновик версии 1')
  results.checks.push({ name: 'failed-v3-preserves-active-v2-and-removes-only-failed-cache', passed: true })
  site = v2
  await context.close()

  const demoContext = await browser.newContext()
  const demo = await demoContext.newPage()
  await launch(demo, base + '/?demo=1')
  await demo.waitForTimeout(500)
  assert.equal(await demo.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0)
  assert.equal(await demo.evaluate(async () => (await caches.keys()).length), 0)
  results.checks.push({ name: 'demo-does-not-create-worker-or-cache', passed: true })
  await demoContext.close()

  const profile = join(temporary, 'profile')
  await rm(profile, { recursive: true, force: true })
  let persistent = await chromium.launchPersistentContext(profile, { executablePath, headless: true })
  persistentContexts.push(persistent)
  await controlled(persistent.pages()[0], base + '/')
  await persistent.close()
  persistent = await chromium.launchPersistentContext(profile, { executablePath, headless: true })
  persistentContexts.push(persistent)
  delay = 8000
  const coldSlowMs = await launch(persistent.pages()[0])
  delay = 0
  assert(coldSlowMs < 1000)
  results.checks.push({ name: 'browser-restarted-slow-network-cold-load', passed: true, ms: coldSlowMs })
  await persistent.close()
  persistent = await chromium.launchPersistentContext(profile, { executablePath, headless: true })
  persistentContexts.push(persistent)
  await persistent.setOffline(true)
  const cold = persistent.pages()[0]
  const offlineMs = await launch(cold)
  assert(offlineMs < 1000)
  results.checks.push({ name: 'browser-restarted-offline-cold-load', passed: true, ms: offlineMs })
  await persistent.close()
  assert.deepEqual(errors, [])
  await mkdir(join(repository, 'audit'), { recursive: true })
  await writeFile(process.env.DZ_PWA_RESULTS ?? join(repository, 'audit/pwa-results.json'), JSON.stringify({ baselineRevision, ...results }, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  await Promise.allSettled(persistentContexts.map(context => context.close()))
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  await rm(temporary, { recursive: true, force: true })
}
