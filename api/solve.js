import { waitUntil } from '@vercel/functions'
import crypto from 'node:crypto'
import { store } from '../lib/redis.js'
import { getConfig } from '../lib/config.js'
import { requireApiKey, rateLimit, dailyGuard } from '../lib/auth.js'
import { runSolve } from '../lib/engine.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '*'); return res.status(204).end() }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  const keyMeta = await requireApiKey(req, res); if (!keyMeta) return
  const cfg = await getConfig()

  if (!(await rateLimit(keyMeta.key, cfg.rateLimitPerMin))) return res.status(429).json({ ok: false, error: 'rate_limited' })
  if (!(await dailyGuard(keyMeta.key, cfg.dailyLimit))) return res.status(429).json({ ok: false, error: 'daily_limit_reached' })

  const { type = 'hcaptcha', sitekey, url, sync } = req.body || {}
  if (!sitekey) return res.status(400).json({ ok: false, error: 'missing_sitekey' })
  if (!url) return res.status(400).json({ ok: false, error: 'missing_url' })
  if (!['hcaptcha', 'recaptcha_v2', 'recaptcha_v3'].includes(type)) return res.status(400).json({ ok: false, error: 'unsupported_type' })

  const taskId = crypto.randomUUID()
  const params = { type, sitekey, url, action: req.body.action, invisible: !!req.body.invisible, enterprise: !!req.body.enterprise }

  await store.set(`task:${taskId}`, { status: 'queued', type }, 900)
  const job = runSolve(taskId, params, keyMeta.key)

  if (sync || req.query?.sync) {
    try {
      const token = await job
      return res.json({ ok: true, status: 'ready', token, taskId })
    } catch (e) {
      return res.status(422).json({ ok: false, status: 'error', error: String(e.message), taskId })
    }
  }

  waitUntil(job.catch(() => {}))
  res.status(202).json({ ok: true, status: 'processing', taskId })
}