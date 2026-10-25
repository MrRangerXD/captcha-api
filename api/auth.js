import { getConfig, setConfig } from '../lib/config.js'
import { hashPassword, verifyPassword, createSession, destroySession, requireAdmin } from '../lib/auth.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const c = await getConfig()
    if (!c.adminHash) return res.json({ ok: true, setup: true })
    const s = req.headers['x-admin-token'] ? await requireAdminSilent(req) : null
    return res.json({ ok: !!s, setup: false })
  }

  if (req.method === 'POST') {
    const { action, password } = req.body || {}
    const c = await getConfig()

    if (action === 'setup') {
      if (c.adminHash) return res.status(400).json({ ok: false, error: 'already_setup' })
      if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'password_too_short' })
      await setConfig({ adminHash: hashPassword(password) })
      return res.json({ ok: true, token: await createSession() })
    }

    if (action === 'login') {
      if (!verifyPassword(password || '', c.adminHash)) return res.status(401).json({ ok: false, error: 'wrong_password' })
      return res.json({ ok: true, token: await createSession() })
    }
    return res.status(400).json({ ok: false, error: 'bad_action' })
  }

  if (req.method === 'DELETE') {
    await destroySession(req.headers['x-admin-token'])
    return res.json({ ok: true })
  }

  res.status(405).json({ ok: false })
}

async function requireAdminSilent(req) {
  const { store } = await import('../lib/redis.js')
  return store.get(`session:${req.headers['x-admin-token']}`)
}