import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

let DatabaseSync = null
try { ({ DatabaseSync } = await import('node:sqlite')) } catch { DatabaseSync = null }

const memory = new Map()
let db = null

function openDb() {
  if (!DatabaseSync) return null
  const candidates = []
  if (process.env.DB_PATH) candidates.push(process.env.DB_PATH)
  // Vercel's /var/task is read-only — go straight to /tmp there.
  if (process.env.VERCEL) candidates.push('/tmp/captcha.db')
  candidates.push(path.resolve(process.cwd(), 'captcha.db'))
  candidates.push(path.join(os.tmpdir(), 'captcha.db'))

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true })
      const d = new DatabaseSync(candidate)
      d.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)')
      return d
    } catch { /* next */ }
  }
  return null
}

db = openDb()

function parseValue(raw) {
  if (raw === null || raw === undefined) return null
  try { return JSON.parse(raw) } catch { return raw }
}

function memGet(k) {
  const e = memory.get(k)
  if (!e) return null
  if (e.expires_at && e.expires_at <= Date.now()) { memory.delete(k); return null }
  return e
}

function getRow(key) {
  if (!db) return memGet(key)
  const row = db.prepare('SELECT value, expires_at FROM kv WHERE key = ?').get(key)
  if (!row) return null
  if (row.expires_at && row.expires_at <= Date.now()) {
    db.prepare('DELETE FROM kv WHERE key = ?').run(key)
    return null
  }
  return row
}

function put(key, value, expiresAt) {
  if (!db) { memory.set(key, { value, expires_at: expiresAt }); return }
  db.prepare(
    'INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at'
  ).run(key, value, expiresAt)
}

export const store = {
  persistent: !!db,
  async set(k, v, ttl) {
    put(k, JSON.stringify(v), ttl ? Date.now() + ttl * 1000 : null)
    return true
  },
  async get(k) {
    const row = getRow(k)
    return row ? parseValue(row.value) : null
  },
  async del(k) {
    if (!db) { memory.delete(k); return true }
    db.prepare('DELETE FROM kv WHERE key = ?').run(k)
    return true
  },
  async incr(k, ttl) {
    const row = getRow(k)
    const current = Number(parseValue(row?.value) ?? 0)
    const next = current + 1
    const expiresAt = row?.expires_at ?? (ttl ? Date.now() + ttl * 1000 : null)
    put(k, JSON.stringify(next), expiresAt)
    return next
  }
}
