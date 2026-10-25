import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function waitFor(fn, { timeout = 20000, interval = 400, label = 'cond' } = {}) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(interval)
  }
  throw new Error(`timeout:${label}`)
}

export async function launchBrowser(proxy) {
  const args = [
    ...chromium.args,
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--lang=en-US,en'
  ]
  if (proxy) args.push(`--proxy-server=${proxy}`)

  return puppeteer.launch({
    args,
    defaultViewport: { width: 1366, height: 900 },
    executablePath: await chromium.executablePath(),
    headless: true,
    protocolTimeout: 180000
  })
}

export async function preparePage(browser) {
  const page = await browser.newPage()
  await page.setUserAgent(UA)
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
    window.chrome = { runtime: {}, app: { isInstalled: false } }
  })
  return page
}

export function parseCookies(input) {
  if (!input) return []
  let obj = {}
  const t = String(input).trim()
  if (t.startsWith('{')) { try { obj = JSON.parse(t) } catch {} }
  else for (const p of t.split(';')) { const i = p.indexOf('='); if (i > 0) obj[p.slice(0, i).trim()] = p.slice(i + 1).trim() }
  return Object.entries(obj).map(([name, value]) => ({ name, value, domain: '.discord.com', path: '/' }))
}