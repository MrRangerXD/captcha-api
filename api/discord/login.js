import { store } from '../../lib/redis.js'
import { getConfig, setConfig } from '../../lib/config.js'
import { requireAdmin } from '../../lib/auth.js'
import { launchBrowser, preparePage, parseCookies } from '../../lib/browser.js'
import { discordLogin } from '../../lib/discord.js'

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  const { email, password, mfaCode, invite, cookies } = req.body || {}
  if (!email || !password) return res.status(400).json({ ok: false, error: 'email_password_required' })

  const cfg = await getConfig()
  if (cookies && cookies !== cfg.discordCookies) await setConfig({ discordCookies: cookies })

  let browser
  try {
    browser = await launchBrowser(cfg.proxy)
    const page = await preparePage(browser)

    const jar = parseCookies(cookies || cfg.discordCookies)
    if (jar.length) await page.setCookie(...jar)

    const result = await discordLogin(page, { email, password, mfaCode, invite })

    const logs = (await store.get('logs')) || []
    logs.unshift({ at: Date.now(), type: 'discord_login', ok: !!result.ok, ms: 0, key: 'discord' })
    await store.set('logs', logs.slice(0, 60))

    res.status(result.ok ? 200 : 422).json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  } finally {
    try { await browser?.close() } catch {}
  }
}