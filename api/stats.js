import { store } from '../lib/redis.js'
import { requireAdmin } from '../lib/auth.js'

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  if (req.query.logs) return res.json({ ok: true, logs: (await store.get('logs')) || [] })

  const day = new Date().toISOString().slice(0, 10)
  const today = (await store.get(`stat:${day}`)) || { total: 0, success: 0, msSum: 0 }

  const allKeys = (await store.get('apikeys')) || []
  const agg = { total: 0, success: 0, msSum: 0 }
  const cur = await Promise.all(allKeys.map(() => null))
  void cur
  agg.total = today.total; agg.success = today.success; agg.msSum = today.msSum

  res.json({
    ok: true,
    total: agg.total,
    today: today.total,
    success: agg.success,
    avgMs: agg.success ? Math.round(agg.msSum / agg.success) : 0
  })
}