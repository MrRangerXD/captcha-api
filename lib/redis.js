const mem = new Map()

function memGet(k) {
  const e = mem.get(k)
  if (!e) return null
  if (e.exp && e.exp < Date.now()) { mem.delete(k); return null }
  return e.v
}

let client = null
async function getRedis() {
  if (client) return client
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const { Redis } = await import('@upstash/redis')
  client = new Redis({ url, token })
  return client
}

export const store = {
  async set(k, v, ttl) {
    const r = await getRedis()
    if (r) return ttl ? r.set(k, v, { ex: ttl }) : r.set(k, v)
    mem.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 })
  },
  async get(k) {
    const r = await getRedis()
    if (r) return r.get(k)
    return memGet(k)
  },
  async del(k) {
    const r = await getRedis()
    if (r) return r.del(k)
    mem.delete(k)
  },
  async incr(k, ttl) {
    const r = await getRedis()
    if (r) { const n = await r.incr(k); if (n === 1 && ttl) await r.expire(k, ttl); return n }
    const cur = Number(memGet(k) || 0) + 1
    const prev = mem.get(k)
    mem.set(k, { v: cur, exp: prev?.exp || (ttl ? Date.now() + ttl * 1000 : 0) })
    return cur
  }
}