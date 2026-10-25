import { getConfig, setConfig } from '../lib/config.js'
import { requireAdmin, hashPassword } from '../lib/auth.js'

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return

  if (req.method === 'GET') {
    const c = await getConfig()
    return res.json({ ok: true, config: { ...c, adminHash: undefined, hasOrKey: !!c.openrouterKey } })
  }

  if (req.method === 'PUT') {
    const b = req.body || {}
    const patch = {}
    for (const k of ['openrouterKey', 'model', 'proxy', 'discordCookies']) if (b[k] !== undefined) patch[k] = b[k]
    for (const k of ['rateLimitPerMin', 'dailyLimit']) if (b[k] !== undefined) patch[k] = Number(b[k])
    if (b.password) patch.adminHash = hashPassword(b.password)
    await setConfig(patch)
    return res.json({ ok: true })
  }

  res.status(405).json({ ok: false })
}