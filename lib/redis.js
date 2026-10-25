import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function resolveDb() {
  const candidates = []
  if (process.env.DB_PATH) candidates.push(process.env.DB_PATH)
  candidates.push(path.resolve(process.cwd(), 'captcha.db'))
  candidates.push(path.join(os.tmpdir(), 'captcha.db'))

  for (const candidate of candidates) {
    try {
      const dir = path.dirname(candidate)
      fs.mkdirSync(dir, { recursive: true })
      const db = new DatabaseSync(candidate)
      db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)')
      return db
    } catch {
      // try next candidate
    }
  }

  throw new Error('Unable to initialize SQLite database')
}

const db = resolveDb()

function parseValue(raw) {
  if (raw === null || raw === undefined) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function getRow(key) {
  const row = db.prepare('SELECT value, expires_at FROM kv WHERE key = ?').get(key)
  if (!row) return null
  if (row.expires_at && row.expires_at <= Date.now()) {
    db.prepare('DELETE FROM kv WHERE key = ?').run(key)
    return null
  }
  return row
}

export const store = {
  async set(k, v, ttl) {
    const expiresAt = ttl ? Date.now() + ttl * 1000 : null
    db.prepare(
      'INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at'
    ).run(k, JSON.stringify(v), expiresAt)
    return true
  },

  async get(k) {
    const row = getRow(k)
    return row ? parseValue(row.value) : null
  },

  async del(k) {
    db.prepare('DELETE FROM kv WHERE key = ?').run(k)
    return true
  },

  async incr(k, ttl) {
    const row = getRow(k)
    const current = Number(parseValue(row?.value) ?? 0)
    const next = current + 1
    const expiresAt = ttl ? Date.now() + ttl * 1000 : (row?.expires_at ?? null)

    db.prepare(
      'INSERT INTO kv (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at'
    ).run(k, JSON.stringify(next), expiresAt)

    return next
  }
}