import { store } from '../lib/redis.js'
import { requireApiKey } from '../lib/auth.js'

export default async function handler(req, res) {
  if (!(await requireApiKey(req, res))) return
  const t = await store.get(`task:${req.query.id}`)
  if (!t) return res.status(404).json({ ok: false, status: 'not_found' })
  if (t.status === 'ready') return res.json({ ok: true, status: 'ready', token: t.token })
  if (t.status === 'error') return res.status(422).json({ ok: false, status: 'error', error: t.error })
  res.status(202).json({ ok: false, status: t.status })
}