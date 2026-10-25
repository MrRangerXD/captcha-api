const $ = (s) => document.querySelector(s)
const base = location.origin
const isLoginPage = /\/login(\.html)?$/.test(location.pathname)

let adminToken = localStorage.getItem('cs_token') || ''
let auth = {}
let firstKey = ''

function toast(msg, bad) {
  const t = $('#toast'); if (!t) return
  t.textContent = msg
  t.style.borderColor = bad ? 'var(--err)' : 'var(--line)'
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2600)
}

async function req(path, { method = 'GET', body, admin = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (admin && adminToken) headers['x-admin-token'] = adminToken
  let res
  try {
    res = await fetch(base + path, {
      method, headers, credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    toast('Network error', true)
    return { ok: false, error: 'network' }
  }
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && admin) showGate()
  return json
}

function showGate() { $('#gate')?.classList.remove('hidden'); $('#app')?.classList.add('hidden') }
function showApp() { $('#gate')?.classList.add('hidden'); $('#app')?.classList.remove('hidden') }
function setErr(m) { const e = $('#gateErr'); if (e) e.textContent = m || '' }

async function boot() {
  const err = new URLSearchParams(location.search).get('error')
  const s = await req('/api/auth', { admin: false })
  auth = s || {}

  if (auth.setup) {
    $('#setupForm')?.classList.remove('hidden')
    const sub = $('#gateSub'); if (sub) sub.textContent = 'Pehli baar — admin password banao.'
    if (err) setErr(decodeURIComponent(err))
    return
  }

  if (auth.ok) {
    if (auth.user?.name) {
      const w = $('#whoName'); if (w) w.textContent = auth.user.name
      const a = $('#whoAvatar')
      if (a && auth.user.id) a.src = `https://cdn.discordapp.com/embed/avatars/0.png`
    }
    if (isLoginPage) return location.replace('/')
    showApp(); init(); return
  }

  showGate()
  if (auth.discord) {
    $('#discordBox')?.classList.remove('hidden')
    const note = $('#joinNote')
    if (note && auth.guildId) note.textContent = `Signing in also joins the NBC Prime server (${auth.guildId}).`
  } else {
    $('#loginForm')?.classList.remove('hidden')
  }
  if (err) setErr(decodeURIComponent(err))
}

/* ---------- gate actions ---------- */
$('#doSetup')?.addEventListener('click', async () => {
  const a = $('#setupPw').value, b = $('#setupPw2').value
  if (a.length < 6) return setErr('min 6 characters')
  if (a !== b) return setErr('passwords match nahi kar rahe')
  const r = await req('/api/auth', { method: 'POST', body: { action: 'setup', password: a }, admin: false })
  if (!r.ok) return setErr(r.error)
  adminToken = r.token || ''; if (r.token) localStorage.setItem('cs_token', r.token)
  if (isLoginPage) return location.replace('/')
  showApp(); init()
})

$('#doLogin')?.addEventListener('click', async () => {
  const r = await req('/api/auth', { method: 'POST', body: { action: 'login', password: $('#loginPw').value }, admin: false })
  if (!r.ok) return setErr(r.error)
  adminToken = r.token || ''; if (r.token) localStorage.setItem('cs_token', r.token)
  if (isLoginPage) return location.replace('/')
  showApp(); init()
})

$('#usePassword')?.addEventListener('click', () => {
  $('#discordBox')?.classList.add('hidden')
  $('#loginForm')?.classList.remove('hidden')
})

$('#logout')?.addEventListener('click', async () => {
  await req('/api/auth', { method: 'DELETE' })
  localStorage.removeItem('cs_token'); adminToken = ''
  location.href = '/login'
})

/* ---------- tabs ---------- */
document.querySelectorAll('.nav').forEach((n) => {
  n.onclick = () => {
    document.querySelectorAll('.nav').forEach((x) => x.classList.remove('active'))
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'))
    n.classList.add('active')
    $('#tab-' + n.dataset.tab)?.classList.add('active')
    if (n.dataset.tab === 'logs') loadLogs()
  }
})

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]')
  if (!c) return
  const el = $(c.dataset.copy)
  if (el) { navigator.clipboard.writeText(el.textContent); toast('Copied') }
})

/* ---------- init ---------- */
function refreshCurl() {
  const el = $('#quickCurl'); if (!el) return
  el.textContent =
`curl -X POST ${base}/api/solve \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${firstKey || 'YOUR_KEY'}" \\
  -d '{"type":"hcaptcha","sitekey":"...","url":"https://example.com"}'`
}

async function init() {
  const b = $('#baseUrl'); if (b) b.textContent = base
  refreshCurl()
  await loadConfig(); await loadKeys(); await loadStats()
  health(); setInterval(health, 30000)
}

async function health() {
  const h = await req('/api/health', { admin: false })
  const d = $('#healthDot'); if (d) d.className = 'dot ' + (h.ok ? 'ok' : 'bad')
  const t = $('#healthTxt'); if (t) t.textContent = h.ok ? 'online' : 'offline'
}

async function loadStats() {
  const s = await req('/api/stats')
  if (!s.ok && s.ok !== undefined && !s.total && !s.today) return
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v }
  set('#sTotal', s.total ?? 0)
  set('#sToday', s.today ?? 0)
  set('#sRate', s.total ? (100 * s.success / s.total).toFixed(1) + '%' : '–')
  set('#sAvg', s.avgMs ? (s.avgMs / 1000).toFixed(1) + 's' : '–')
}

async function loadConfig() {
  const r = await req('/api/settings')
  const c = r.config || {}
  const v = (id, val) => { const e = $(id); if (e) e.value = val }
  v('#setOrKey', c.openrouterKey || '')
  v('#setModel', c.model || 'openrouter/free')
  v('#setProxy', c.proxy || '')
  v('#setRl', c.rateLimitPerMin ?? 30)
  v('#setDl', c.dailyLimit ?? 2000)
  v('#dcCookies', c.discordCookies || '')
  v('#setGuild', c.discordGuildId || '')
  v('#setClientId', c.discordClientId || '')
  v('#setAllow', c.discordAllowlist || '')
}

$('#saveSettings')?.addEventListener('click', async () => {
  const val = (id) => $(id)?.value.trim() ?? ''
  const body = {
    openrouterKey: val('#setOrKey'),
    model: val('#setModel') || 'openrouter/free',
    proxy: val('#setProxy'),
    rateLimitPerMin: Number(val('#setRl')) || 30,
    dailyLimit: Number(val('#setDl')) || 2000,
    discordCookies: val('#dcCookies'),
    discordGuildId: val('#setGuild') || undefined,
    discordClientId: val('#setClientId') || undefined,
    discordClientSecret: val('#setSecret') || undefined,
    discordBotToken: val('#setBotToken') || undefined,
    discordAllowlist: val('#setAllow'),
    password: val('#setPw') || undefined
  }
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k]
  const r = await req('/api/settings', { method: 'PUT', body })
  toast(r.ok ? 'Saved' : (r.error || 'failed'), !r.ok)
  const p = $('#setPw'); if (p) p.value = ''
})

/* ---------- keys ---------- */
async function loadKeys() {
  const { keys = [] } = await req('/api/keys')
  firstKey = keys[0]?.key || ''
  refreshCurl()

  const tb = $('#keysTable tbody'); if (!tb) return
  tb.innerHTML = ''
  keys.forEach((k) => {
    const tr = document.createElement('tr')
    const td = (html) => { const d = document.createElement('td'); d.innerHTML = html; return d }
    tr.appendChild(td(`<code>${escapeHtml(k.key.slice(0, 16))}…</code>`))
    tr.appendChild(td(escapeHtml(k.label || '–')))
    tr.appendChild(td(String(k.usage || 0)))
    tr.appendChild(td(new Date(k.createdAt).toLocaleDateString()))
    const last = document.createElement('td')
    const btn = document.createElement('button')
    btn.className = 'btn ghost tiny danger'
    btn.textContent = 'revoke'
    btn.onclick = async () => {
      await req('/api/keys', { method: 'DELETE', body: { key: k.key } })
      toast('Revoked'); loadKeys()
    }
    last.appendChild(btn); tr.appendChild(last)
    tb.appendChild(tr)
  })
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

$('#genKey')?.addEventListener('click', async () => {
  const r = await req('/api/keys', { method: 'POST', body: { label: $('#keyLabel').value || 'default' } })
  if (r.ok) { toast('Key banaya'); $('#keyLabel').value = ''; loadKeys() }
})

/* ---------- playground ---------- */
$('#pgRun')?.addEventListener('click', async () => {
  const type = $('#pgType').value
  const sitekey = $('#pgSitekey').value.trim()
  const url = $('#pgUrl').value.trim()
  if (!sitekey || !url) return toast('sitekey + url chahiye', true)

  const st = $('#pgState'), tokEl = $('#pgToken'), meta = $('#pgMeta')
  st.className = 'pill run'; st.textContent = 'solving'
  tokEl.textContent = ''; meta.textContent = ''
  const t0 = Date.now()

  const r = await req('/api/solve?sync=1', { method: 'POST', body: {
    type, sitekey, url,
    action: $('#pgAction').value.trim() || undefined,
    enterprise: $('#pgEnterprise').checked,
    invisible: $('#pgInvisible').checked
  }})

  if (r.token) {
    st.className = 'pill ok'; st.textContent = 'ready'
    tokEl.textContent = r.token
    meta.textContent = `${((Date.now() - t0) / 1000).toFixed(1)}s`
  } else {
    st.className = 'pill bad'; st.textContent = 'error'
    meta.textContent = r.error || 'failed'
  }
})

/* ---------- discord ---------- */
async function dcRun(join) {
  const email = $('#dcEmail').value.trim()
  const password = $('#dcPass').value
  if (!email || !password) return toast('email + password chahiye', true)

  const st = $('#dcState'), out = $('#dcOut')
  st.className = 'pill run'; st.textContent = 'working'
  out.textContent = 'browser start ho raha hai…'

  const r = await req('/api/discord/login', { method: 'POST', body: {
    email, password,
    mfaCode: $('#dcMfa').value.trim() || undefined,
    invite: join ? ($('#dcInvite').value.trim() || auth.guildId) : undefined,
    cookies: $('#dcCookies').value.trim()
  }})

  out.textContent = JSON.stringify(r, null, 2)
  st.className = 'pill ' + (r.ok ? 'ok' : 'bad')
  st.textContent = r.ok ? 'done' : 'error'
  if (r.cookies) $('#dcCookies').value = r.cookies
}

$('#dcLogin')?.addEventListener('click', () => dcRun(false))
$('#dcJoin')?.addEventListener('click', () => dcRun(true))

/* ---------- logs ---------- */
async function loadLogs() {
  const { logs = [] } = await req('/api/stats?logs=1')
  const tb = $('#logsTable tbody'); if (!tb) return
  tb.innerHTML = ''
  logs.forEach((l) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${new Date(l.at).toLocaleTimeString()}</td><td>${escapeHtml(l.type)}</td>
      <td><span class="pill ${l.ok ? 'ok' : 'bad'}">${l.ok ? 'ok' : 'fail'}</span></td>
      <td>${l.ms ?? 0}</td><td><code>${escapeHtml((l.key || '').slice(0, 8))}…</code></td>`
    tb.appendChild(tr)
  })
}

boot()
