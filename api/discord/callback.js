import { getConfig } from '../../lib/config.js'
import { createSession } from '../../lib/auth.js'
import { exchangeCode, fetchMe, joinGuild, readState } from '../../lib/oauth.js'
import { originOf, setSessionCookie } from '../../lib/http.js'

const fail = (res, code) => { res.writeHead(302, { Location: `/?error=${encodeURIComponent(code)}` }); res.end() }

export default async function handler(req, res) {
  const c = await getConfig()
  if (!c.oauthReady) return fail(res, 'discord_oauth_not_configured')

  const { code, state, error } = req.query || {}
  if (error) return fail(res, error)

  const st = readState(state)
  if (!code || !st) return fail(res, 'bad_state')

  const redirectUri = c.discordRedirectUri || `${originOf(req)}/api/discord/callback`

  let tok, me
  try {
    tok = await exchangeCode({
      clientId: c.discordClientId,
      clientSecret: c.discordClientSecret,
      redirectUri,
      code
    })
    me = await fetchMe(tok.access_token)
  } catch (e) {
    return fail(res, String(e.message || e).slice(0, 120))
  }

  const allow = (c.discordAllowlist || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (allow.length && !allow.includes(me.id)) return fail(res, 'not_allowlisted')

  // "join the server when someone verifies"
  let joined = null
  if (c.discordJoinGuild !== false && c.discordBotToken && c.discordGuildId) {
    try {
      joined = await joinGuild({
        botToken: c.discordBotToken,
        guildId: c.discordGuildId,
        userId: me.id,
        accessToken: tok.access_token
      })
    } catch (e) {
      joined = { ok: false, error: String(e.message || e) }
    }
  }

  const token = await createSession({
    id: me.id,
    name: me.global_name || me.username,
    via: 'discord'
  })
  setSessionCookie(req, res, token)

  const dest = joined && joined.ok === false ? `/?joined=0` : (st.redirect || '/')
  res.writeHead(302, { Location: dest })
  res.end()
}
