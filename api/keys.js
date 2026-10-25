import crypto from 'node:crypto'
import { store } from '../lib/redis.js'
import { requireAdmin } from '../lib/auth.js'

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  if (req.method === 'GET') return res.json({ ok: true, keys: (await store.get('apikeys')) || [] })

  if (req.method === 'POST') {
    const keys = (await store.get('apikeys')) || []
    const entry = {
      key: 'cs_' + crypto.randomBytes(20).toString('hex'),
      label: req.body?.label || 'default',
      createdAt: Date.now(),
      usage: 0
    }
    keys.push(entry)
    await store.set('apikeys', keys)
    return res.json({ ok: true, key: entry })
  }

  if (req.method === 'DELETE') {
    const keys = (await store.get('apikeys')) || []
    await store.set('apikeys', keys.filter((k) => k.key !== req.body?.key))
    return res.json({ ok: true })
  }

  res.status(405).json({ ok: false })
}