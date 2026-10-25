import crypto from 'node:crypto'
import { signSession, verifySession } from './auth.js'

const API = 'https://discord.com/api/v10'
const SCOPES = ['identify', 'email', 'guilds.join']

export function buildAuthUrl({ clientId, redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
    prompt: 'consent'
  })
  return `https://discord.com/oauth2/authorize?${p.toString()}`
}

export const makeState = (redirect = '/') =>
  signSession({ n: crypto.randomBytes(8).toString('hex'), redirect }, 600)

export const readState = (state) => verifySession(state)

export async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  })
  const r = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error_description || j.error || `token_${r.status}`)
  return j
}

export async function fetchMe(accessToken) {
  const r = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.message || `me_${r.status}`)
  return j
}

export async function joinGuild({ botToken, guildId, userId, accessToken }) {
  const r = await fetch(`${API}/guilds/${guildId}/members/${userId}`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken })
  })
  if (r.status === 201 || r.status === 204) return { ok: true, status: r.status }
  const j = await r.json().catch(() => ({}))
  return { ok: false, status: r.status, error: j }
}

export const avatarUrl = (u) =>
  u?.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u?.id || '0') >> 22n) % 6}.png`
