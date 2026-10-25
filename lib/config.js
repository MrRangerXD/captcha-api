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

export async function getConfig() {
  return { ...DEFAULTS, ...((await store.get('config')) || {}) }
}

export async function setConfig(patch) {
  const next = { ...(await getConfig()), ...patch }
  await store.set('config', next)
  return next
}