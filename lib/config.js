import { store } from './redis.js'

const DEFAULTS = {
  openrouterKey: '',
  model: 'openrouter/free',
  proxy: '',
  rateLimitPerMin: 30,
  dailyLimit: 2000,
  adminHash: '',
  discordCookies: ''
}

function envOverrides() {
  const o = {}
  if (process.env.OPENROUTER_KEY) o.openrouterKey = process.env.OPENROUTER_KEY
  if (process.env.OPENROUTER_MODEL) o.model = process.env.OPENROUTER_MODEL
  if (process.env.PROXY_SERVER) o.proxy = process.env.PROXY_SERVER
  if (process.env.RATE_LIMIT_PER_MIN) o.rateLimitPerMin = Number(process.env.RATE_LIMIT_PER_MIN)
  if (process.env.DAILY_LIMIT) o.dailyLimit = Number(process.env.DAILY_LIMIT)
  return o
}

export async function getConfig() {
  const stored = (await store.get('config')) || {}
  return { ...DEFAULTS, ...stored, ...envOverrides() }
}

export async function setConfig(patch) {
  const stored = (await store.get('config')) || {}
  await store.set('config', { ...stored, ...patch })
  return getConfig()
}