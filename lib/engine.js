import { launchBrowser, preparePage } from './browser.js'
import { store } from './redis.js'
import { getConfig } from './config.js'
import { bumpKeyUsage } from './auth.js'
import { withSlot } from './queue.js'
import { solveRecaptcha } from './solvers/recaptcha.js'
import { solveHcaptcha } from './solvers/hcaptcha.js'

const TTL = 900

// merges instead of replacing — the old version wiped type/status every call
export async function patch(id, p) {
  const key = `task:${id}`
  const cur = (await store.get(key)) || {}
  await store.set(key, { ...cur, ...p, updatedAt: Date.now() }, TTL)
}

export async function log(entry) {
  const logs = (await store.get('logs')) || []
  logs.unshift(entry)
  await store.set('logs', logs.slice(0, 80))
}

export async function bumpStat(ok, ms) {
  const day = new Date().toISOString().slice(0, 10)
  const dayKey = `stat:${day}`
  const d = (await store.get(dayKey)) || { total: 0, success: 0, msSum: 0 }
  d.total++; if (ok) { d.success++; d.msSum += ms }
  await store.set(dayKey, d, 60 * 60 * 24 * 90)

  const all = (await store.get('stat:all')) || { total: 0, success: 0, msSum: 0 }
  all.total++; if (ok) { all.success++; all.msSum += ms }
  await store.set('stat:all', all)
}

async function once(taskId, params) {
  const cfg = await getConfig()
  await patch(taskId, { status: 'launching' })
  const browser = await launchBrowser(cfg.proxy)
  try {
    const page = await preparePage(browser)
    await patch(taskId, { status: 'solving' })
    const token = params.type.startsWith('recaptcha')
      ? await solveRecaptcha(page, params)
      : await solveHcaptcha(page, params)
    return token
  } finally {
    try { await browser.close() } catch {}
  }
}

export async function runSolve(taskId, params, apiKey) {
  const t0 = Date.now()
  try {
    const token = await withSlot(async () => {
      try {
        return await once(taskId, params)
      } catch (e) {
        await patch(taskId, { status: 'retrying', lastError: String(e?.message || e) })
        return await once(taskId, params)
      }
    })

    const ms = Date.now() - t0
    await patch(taskId, { status: 'ready', token, ms })
    await bumpStat(true, ms)
    await bumpKeyUsage(apiKey)
    await log({ at: Date.now(), type: params.type, ok: true, ms, key: apiKey })
    return token
  } catch (e) {
    const ms = Date.now() - t0
    await patch(taskId, { status: 'error', error: String(e?.message || e), ms })
    await bumpStat(false, ms)
    await bumpKeyUsage(apiKey)
    await log({ at: Date.now(), type: params.type, ok: false, ms, key: apiKey })
    throw e
  }
}
