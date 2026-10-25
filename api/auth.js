import { getConfig, setConfig } from '../lib/config.js'
import { hashPassword, verifyPassword, createSession, destroySession, requireAdmin } from '../lib/auth.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const c = await getConfig()
    if (!c.adminHash && !process.env.ADMIN_PASSWORD) return res.json({ ok: true, setup: true })
    const s = await getSession(req)
    return res.json({ ok: !!s, setup: false })
  }

  if (req.method === 'POST') {
    const { action, password } = parseBody(req)
    const c = await getConfig()

    if (action === 'setup') {
      if (c.adminHash) return res.status(400).json({ ok: false, error: 'already_setup' })
      if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'password_too_short' })
      await setConfig({ adminHash: hashPassword(password) })
      return res.json({ ok: true, token: await createSession() })
    }

    if (action === 'login') {
      const okEnv = !!process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD
      const okStored = verifyPassword(password || '', c.adminHash)
      if (!okEnv && !okStored) return res.status(401).json({ ok: false, error: 'wrong_password' })
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