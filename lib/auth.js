import crypto from 'node:crypto'
import { store } from './redis.js'

const SESSION_TTL = 60 * 60 * 24 * 7 // 7 days

// Sessions are signed, not stored — they survive cold starts and /tmp wipes.
function secret() {
  return process.env.SESSION_SECRET
    || process.env.ADMIN_PASSWORD
    || process.env.API_KEYS
    || 'cs-dev-secret-change-me'
}

const b64u = (b) => Buffer.from(b).toString('base64url')

export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`
}

export function verifyPassword(pw, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false
  const [salt, h] = stored.split(':')
  let check
  try { check = crypto.scryptSync(pw || '', salt, 64) } catch { return false }
  const a = Buffer.from(h, 'hex')
  if (a.length !== check.length) return false
  return crypto.timingSafeEqual(a, check)
}

export function signSession(payload, ttl = SESSION_TTL) {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + ttl * 1000 }
  const data = b64u(JSON.stringify(body))
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [data, sig] = token.split('.')
  const expect = crypto.createHmac('sha256', secret()).update(data).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length) return null
  if (!crypto.timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
    if (p.exp && p.exp < Date.now()) return null
    return p
  } catch { return null }
}

export const createSession = async (user = {}) =>
  signSession({ sub: user.id || 'admin', name: user.name || 'admin', via: user.via || 'password' })

export async function destroySession(token) { if (token) await store.del(`session:${token}`) }

function tokenFrom(req) {
  const h = req.headers['x-admin-token']
  if (h) return h
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)cs_session=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export const getAdmin = (req) => verifySession(tokenFrom(req))

export async function requireAdmin(req, res) {
  const s = getAdmin(req)
  if (!s) { res.status(401).json({ ok: false, error: 'unauthorized' }); return null }
  return s
}

function envKeys() {
  return (process.env.API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean)
}

export async function requireApiKey(req, res) {
  const key = (req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')).trim()
  if (!key) { res.status(401).json({ ok: false, error: 'missing_api_key' }); return null }
  if (envKeys().includes(key)) return { key, label: 'env', usage: 0, env: true }

  const keys = (await store.get('apikeys')) || []
  const found = keys.find((k) => k.key === key && k.enabled !== false)
  if (!found) { res.status(401).json({ ok: false, error: 'invalid_api_key' }); return null }
  return found
}

export async function bumpKeyUsage(key) {
  if (!key || envKeys().includes(key)) return
  const keys = (await store.get('apikeys')) || []
  const i = keys.findIndex((k) => k.key === key)
  if (i < 0) return
  keys[i].usage = (keys[i].usage || 0) + 1
  keys[i].lastUsed = Date.now()
  await store.set('apikeys', keys)
}

export async function rateLimit(key, limit) {
  if (!limit) return true
  const bucket = Math.floor(Date.now() / 60000)
  return (await store.incr(`rl:${key}:${bucket}`, 70)) <= limit
}

export async function dailyGuard(key, limit) {
  if (!limit) return true
  const day = new Date().toISOString().slice(0, 10)
  return (await store.incr(`day:${key}:${day}`, 60 * 60 * 26)) <= limit
}
