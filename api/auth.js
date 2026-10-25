import { getConfig, setConfig } from '../lib/config.js'
import { hashPassword, verifyPassword, createSession, destroySession, getAdmin } from '../lib/auth.js'
import { parseBody, preflight, setSessionCookie, clearSessionCookie } from '../lib/http.js'

export default async function handler(req, res) {
  if (preflight(req, res)) return

  const c = await getConfig()
  const hasAdmin = !!(c.adminHash || process.env.ADMIN_PASSWORD)

  if (req.method === 'GET') {
    const s = getAdmin(req)
    return res.json({
      ok: !!s,
      setup: !hasAdmin,
      discord: c.oauthReady,
      guildId: c.discordGuildId,
      user: s ? { id: s.sub, name: s.name, via: s.via } : null
    })
  }

  if (req.method === 'POST') {
    const { action, password } = parseBody(req)

    if (action === 'setup') {
      if (c.adminHash) return res.status(400).json({ ok: false, error: 'already_setup' })
      if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'password_too_short' })
      await setConfig({ adminHash: hashPassword(password) })
      const token = await createSession({ via: 'password' })
      setSessionCookie(req, res, token)
      return res.json({ ok: true, token })
    }

    if (action === 'login') {
      if (!hasAdmin) return res.status(400).json({ ok: false, error: 'not_setup' })
      const okEnv = !!process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD
      const okStored = verifyPassword(password || '', c.adminHash)
      if (!okEnv && !okStored) return res.status(401).json({ ok: false, error: 'wrong_password' })
      const token = await createSession({ via: 'password' })
      setSessionCookie(req, res, token)
      return res.json({ ok: true, token })
    }

    return res.status(400).json({ ok: false, error: 'bad_action' })
  }

  if (req.method === 'DELETE') {
    await destroySession(req.headers['x-admin-token'])
    clearSessionCookie(res)
    return res.json({ ok: true })
  }

  res.status(405).json({ ok: false, error: 'method_not_allowed' })
}
