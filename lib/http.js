export function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

export function preflight(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-admin-token, Authorization')
  if (req.method === 'OPTIONS') { res.status(204).end(); return true }
  return false
}

export function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return req.body
}

export function setSessionCookie(req, res, token, maxAge = 604800) {
  const secure = (req.headers['x-forwarded-proto'] || 'https') === 'https' ? '; Secure' : ''
  res.setHeader('Set-Cookie',
    `cs_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`)
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'cs_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
}
