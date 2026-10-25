import { getConfig } from '../../lib/config.js'
import { buildAuthUrl, makeState } from '../../lib/oauth.js'
import { originOf } from '../../lib/http.js'

export default async function handler(req, res) {
  const c = await getConfig()
  if (!c.oauthReady) {
    return res.status(400).json({ ok: false, error: 'discord_oauth_not_configured' })
  }
  const redirectUri = c.discordRedirectUri || `${originOf(req)}/api/discord/callback`
  const state = makeState(req.query?.redirect || '/')
  res.writeHead(302, { Location: buildAuthUrl({ clientId: c.discordClientId, redirectUri, state }) })
  res.end()
}
