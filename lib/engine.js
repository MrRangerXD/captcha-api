import { launchBrowser, preparePage } from './browser.js'
import { store } from './redis.js'
import { getConfig } from './config.js'
import { solveRecaptcha } from './solvers/recaptcha.js'
import { solveHcaptcha } from './solvers/hcaptcha.js'

const TTL = 900
const patch = (id, p) => store.set(`task:${id}`, p, TTL)

export async function log(entry) {
  const logs = (await store.get('logs')) || []
  logs.unshift(entry)
  await store.set('logs', logs.slice(0, 60))
}

export async function bumpStat(ok, ms) {
  const day = new Date().toISOString().slice(0, 10)
  const s = (await store.get(`stat:${day}`)) || { total: 0, success: 0, msSum: 0 }
  s.total++
  if (ok) { s.success++; s.msSum += ms }
  await store.set(`stat:${day}`, s, 90000)
}

export async function runSolve(taskId, params, apiKey) {
  const t0 = Date.now()
  let browser
  try {
    const cfg = await getConfig()
    await patch(taskId, { status: 'launching' })
    browser = await launchBrowser(cfg.proxy)
    const page = await preparePage(browser)
    await patch(taskId, { status: 'solving' })

    const token = params.type.startsWith('recaptcha')
      ? await solveRecaptcha(page, params)
      : await solveHcaptcha(page, params)

    const ms = Date.now() - t0
    await patch(taskId, { status: 'ready', token, ms })
    await bumpStat(true, ms)
    await log({ at: Date.now(), type: params.type, ok: true, ms, key: apiKey })
    return token
  } catch (e) {
    const ms = Date.now() - t0
    await patch(taskId, { status: 'error', error: String(e?.message || e), ms })
    await bumpStat(false, ms)
    await log({ at: Date.now(), type: params.type, ok: false, ms, key: apiKey })
    throw e
  } finally {
    try { await browser?.close() } catch {}
  }
}