import crypto from 'node:crypto'
import { store } from './redis.js'

const SESSION_TTL = 60 * 60 * 24 * 7

export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`
}

export function verifyPassword(pw, stored) {
  if (!stored) return false
  const [salt, h] = stored.split(':')
  const check = crypto.scryptSync(pw, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(check, 'hex'))
}

export async function createSession() {
  const t = crypto.randomUUID().replace(/-/g, '') + crypto.randomBytes(8).toString('hex')
  await store.set(`session:${t}`, { at: Date.now() }, SESSION_TTL)
  return t
}

export async function destroySession(t) { if (t) await store.del(`session:${t}`) }

export async function requireAdmin(req, res) {
  const t = req.headers['x-admin-token']
  if (!t) { res.status(401).json({ ok: false, error: 'unauthorized' }); return null }
  const s = await store.get(`session:${t}`)
  if (!s) { res.status(401).json({ ok: false, error: 'session_expired' }); return null }
  return s
}

function envKeys() {
  return (process.env.API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean)
}

export async function requireApiKey(req, res) {
  const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!key) { res.status(401).json({ ok: false, error: 'missing_api_key' }); return null }

  if (envKeys().includes(key)) return { key, label: 'env', usage: 0 }

  const keys = (await store.get('apikeys')) || []
  const found = keys.find((k) => k.key === key && k.enabled !== false)
  if (!found) { res.status(401).json({ ok: false, error: 'invalid_api_key' }); return null }
  return found
}

export async function bumpKeyUsage(key) {
  if (envKeys().includes(key)) return
  const keys = (await store.get('apikeys')) || []
  const i = keys.findIndex((k) => k.key === key)
  if (i < 0) return
  keys[i].usage = (keys[i].usage || 0) + 1
  keys[i].lastUsed = Date.now()
  await store.set('apikeys', keys)
}

export async function rateLimit(key, limit) {
  const bucket = Math.floor(Date.now() / 60000)
  const n = await store.incr(`rl:${key}:${bucket}`, 120)
  return n <= limit
}

export async function dailyGuard(key, limit) {
  if (!limit) return true
  const day = new Date().toISOString().slice(0, 10)
  return (await store.incr(`day:${key}:${day}`, 90000)) <= limit
}