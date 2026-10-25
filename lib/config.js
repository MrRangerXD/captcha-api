import { store } from './redis.js'

export const DEFAULT_GUILD_ID = '1256250708190036019'

const DEFAULTS = {
  openrouterKey: '',
  model: 'openrouter/free',
  proxy: '',
  rateLimitPerMin: 30,
  dailyLimit: 2000,
  adminHash: '',
  discordCookies: '',

  // ---- dashboard sign-in (Discord OAuth2) ----
  discordClientId: '',
  discordClientSecret: '',
  discordBotToken: '',
  discordGuildId: DEFAULT_GUILD_ID,
  discordRedirectUri: '',
  discordAllowlist: '',   // comma separated user ids; empty = everyone
  discordJoinGuild: true
}

const ENV_MAP = {
  OPENROUTER_KEY: 'openrouterKey',
  OPENROUTER_MODEL: 'model',
  PROXY_SERVER: 'proxy',
  DISCORD_CLIENT_ID: 'discordClientId',
  DISCORD_CLIENT_SECRET: 'discordClientSecret',
  DISCORD_BOT_TOKEN: 'discordBotToken',
  DISCORD_GUILD_ID: 'discordGuildId',
  DISCORD_REDIRECT_URI: 'discordRedirectUri',
  DISCORD_ALLOWLIST: 'discordAllowlist'
}

function envOverrides() {
  const o = {}
  for (const [env, key] of Object.entries(ENV_MAP)) {
    const v = process.env[env]
    if (v !== undefined && v !== '') o[key] = v
  }
  for (const [env, key] of [['RATE_LIMIT_PER_MIN', 'rateLimitPerMin'], ['DAILY_LIMIT', 'dailyLimit']]) {
    const n = Number(process.env[env])
    if (Number.isFinite(n) && n > 0) o[key] = n
  }
  if (process.env.DISCORD_JOIN_GUILD === 'false') o.discordJoinGuild = false
  return o
}

export async function getConfig() {
  const stored = (await store.get('config')) || {}
  const cfg = { ...DEFAULTS, ...stored, ...envOverrides() }
  cfg.oauthReady = !!(cfg.discordClientId && cfg.discordClientSecret)
  return cfg
}

export async function setConfig(patch) {
  const stored = (await store.get('config')) || {}
  const clean = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) clean[k] = v
  }
  await store.set('config', { ...stored, ...clean })
  return getConfig()
}
