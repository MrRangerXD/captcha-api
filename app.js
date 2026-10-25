const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]
const base = location.origin
const isLoginPage = location.pathname === '/login' || location.pathname.endsWith('/login')

let adminToken = localStorage.getItem('cs_token') || ''
let config = {}

function toast(msg, bad) {
  const t = $('#toast')
  t.textContent = msg
  t.style.borderColor = bad ? 'var(--err)' : 'var(--line)'
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2600)
}

async function req(path, { method = 'GET', body, admin = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (admin) headers['x-admin-token'] = adminToken
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && admin) { showGate(); throw new Error(json.error || 'unauthorized') }
  return json
}

/* ---------- gate ---------- */
function showGate() {
  const gate = $('#gate')
  if (gate) gate.classList.remove('hidden')
  const app = $('#app')
  if (app) app.classList.add('hidden')
}

function showApp() {
  const gate = $('#gate')
  if (gate) gate.classList.add('hidden')
  const app = $('#app')
  if (app) app.classList.remove('hidden')
}

async function boot() {
  const s = await req('/api/auth', { admin: false })
  if (s.setup) { $('#setupForm').classList.remove('hidden'); $('#gateSub').textContent = 'Pehli baar — admin password banao.' }
  else if (adminToken) {
    const v = await req('/api/auth').catch(() => null)
    if (v?.ok) {
      if (isLoginPage) return window.location.href = '/'
      showApp(); return init()
    }
    showGate()
  } else {
    $('#loginForm').classList.remove('hidden')
  }
}

$('#doSetup').onclick = async () => {
  const a = $('#setupPw').value, b = $('#setupPw2').value
  if (a.length < 6) return $('#gateErr').textContent = 'min 6 characters'
  if (a !== b) return $('#gateErr').textContent = 'passwords match nahi kar rahe'
  const r = await req('/api/auth', { method: 'POST', body: { action: 'setup', password: a }, admin: false })
  if (!r.ok) return $('#gateErr').textContent = r.error
  adminToken = r.token; localStorage.setItem('cs_token', r.token)
  if (isLoginPage) return window.location.href = '/'
  showApp(); init()
}

$('#doLogin').onclick = async () => {
  const r = await req('/api/auth', { method: 'POST', body: { action: 'login', password: $('#loginPw').value }, admin: false })
  if (!r.ok) return $('#gateErr').textContent = r.error
  adminToken = r.token; localStorage.setItem('cs_token', r.token)
  if (isLoginPage) return window.location.href = '/'
  showApp(); init()
}

$('#logout').onclick = async () => {
  await req('/api/auth', { method: 'DELETE' })
  adminToken = ''; localStorage.removeItem('cs_token'); location.reload()
}

/* ---------- tabs ---------- */
$$('.nav').forEach((n) => n.onclick = () => {
  $$('.nav').forEach((x) => x.classList.remove('active'))
  $$('.tab').forEach((x) => x.classList.remove('active'))
  n.classList.add('active')
  $('#tab-' + n.dataset.tab).classList.add('active')
  if (n.dataset.tab === 'logs') loadLogs()
})

document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]')
  if (c) { navigator.clipboard.writeText($(c.dataset.copy).textContent); toast('Copied') }
})

/* ---------- init ---------- */
async function init() {
  $('#baseUrl').textContent = base
  $('#quickCurl').textContent =
`curl -X POST ${base}/api/solve \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_KEY" \\
  -d '{"type":"hcaptcha","sitekey":"...","url":"https://example.com"}'`
  await loadConfig(); await loadKeys(); await loadStats()
  health()
  setInterval(health, 30000)
}

async function health() {
  const h = await req('/api/health', { admin: false })
  $('#healthDot').className = 'dot ' + (h.ok ? 'ok' : 'bad')
  $('#healthTxt').textContent = h.ok ? 'online' : 'offline'
}

async function loadStats() {
  const s = await req('/api/stats')
  $('#sTotal').textContent = s.total ?? 0
  $('#sToday').textContent = s.today ?? 0
  $('#sRate').textContent = s.total ? (100 * s.success / s.total).toFixed(1) + '%' : '–'
  $('#sAvg').textContent = s.avgMs ? (s.avgMs / 1000).toFixed(1) + 's' : '–'
}

async function loadConfig() {
  config = (await req('/api/settings')).config || {}
  $('#setOrKey').value = config.openrouterKey || ''
  $('#setModel').value = config.model || 'openrouter/free'
  $('#setProxy').value = config.proxy || ''
  $('#setRl').value = config.rateLimitPerMin ?? 30
  $('#setDl').value = config.dailyLimit ?? 2000
  $('#dcCookies').value = config.discordCookies || ''
}

$('#saveSettings').onclick = async () => {
  const r = await req('/api/settings', { method: 'PUT', body: {
    openrouterKey: $('#setOrKey').value.trim(),
    model: $('#setModel').value.trim() || 'openrouter/free',
    proxy: $('#setProxy').value.trim(),
    rateLimitPerMin: Number($('#setRl').value) || 30,
    dailyLimit: Number($('#setDl').value) || 2000,
    discordCookies: $('#dcCookies').value.trim(),
    password: $('#setPw').value || undefined
  }})
  toast(r.ok ? 'Saved' : r.error, !r.ok)
  $('#setPw').value = ''
}

/* ---------- keys ---------- */
async function loadKeys() {
  const { keys = [] } = await req('/api/keys')
  const tb = $('#keysTable tbody'); tb.innerHTML = ''
  keys.forEach((k) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td><code>${k.key.slice(0, 14)}…</code></td>
      <td>${k.label || '–'}</td><td>${k.usage || 0}</td>
      <td>${new Date(k.createdAt).toLocaleDateString()}</td>
      <td><button class="btn ghost tiny danger">revoke</button></td>`
    tr.querySelector('button').onclick = async () => {
      await req('/api/keys', { method: 'DELETE', body: { key: k.key } })
      toast('Revoked'); loadKeys()
    }
    tb.appendChild(tr)
  })
  const full = keys[0]
  $('#quickCurl').textContent = $('#quickCurl').textContent.replace(/YOUR_KEY/g, full ? full.key : 'YOUR_KEY')
}

$('#genKey').onclick = async () => {
  const r = await req('/api/keys', { method: 'POST', body: { label: $('#keyLabel').value || 'default' } })
  if (r.ok) { toast('Key banaya'); $('#keyLabel').value = ''; loadKeys() }
}

/* ---------- playground ---------- */
$('#pgRun').onclick = async () => {
  const type = $('#pgType').value
  const sitekey = $('#pgSitekey').value.trim()
  const url = $('#pgUrl').value.trim()
  if (!sitekey || !url) return toast('sitekey + url chahiye', true)

  $('#pgState').className = 'pill run'; $('#pgState').textContent = 'solving'
  $('#pgToken').textContent = ''; $('#pgMeta').textContent = ''
  const t0 = Date.now()

  try {
    const r = await req('/api/solve?sync=1', { method: 'POST', body: {
      type, sitekey, url,
      action: $('#pgAction').value.trim() || undefined,
      enterprise: $('#pgEnterprise').checked,
      invisible: $('#pgInvisible').checked
    }})
    if (r.token) {
      $('#pgState').className = 'pill ok'; $('#pgState').textContent = 'ready'
      $('#pgToken').textContent = r.token
      $('#pgMeta').textContent = `${((Date.now() - t0) / 1000).toFixed(1)}s`
    } else {
      $('#pgState').className = 'pill bad'; $('#pgState').textContent = 'error'
      $('#pgMeta').textContent = r.error || 'failed'
    }
  } catch (e) {
    $('#pgState').className = 'pill bad'; $('#pgState').textContent = 'error'
    $('#pgMeta').textContent = e.message
  }
}

/* ---------- discord ---------- */
async function dcRun(join) {
  const email = $('#dcEmail').value.trim()
  const password = $('#dcPass').value
  if (!email || !password) return toast('email + password chahiye', true)

  $('#dcState').className = 'pill run'; $('#dcState').textContent = 'working'
  $('#dcOut').textContent = 'browser start ho raha hai…'

  const r = await req('/api/discord/login', { method: 'POST', body: {
    email, password,
    mfaCode: $('#dcMfa').value.trim() || undefined,
    invite: join ? $('#dcInvite').value.trim() : undefined,
    cookies: $('#dcCookies').value.trim()
  }})

  $('#dcOut').textContent = JSON.stringify(r, null, 2)
  $('#dcState').className = 'pill ' + (r.ok ? 'ok' : 'bad')
  $('#dcState').textContent = r.ok ? 'done' : 'error'
}

$('#dcLogin').onclick = () => dcRun(false)
$('#dcJoin').onclick = () => dcRun(true)

/* ---------- logs ---------- */
async function loadLogs() {
  const { logs = [] } = await req('/api/stats?logs=1')
  const tb = $('#logsTable tbody'); tb.innerHTML = ''
  logs.forEach((l) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${new Date(l.at).toLocaleTimeString()}</td><td>${l.type}</td>
      <td><span class="pill ${l.ok ? 'ok' : 'bad'}">${l.ok ? 'ok' : 'fail'}</span></td>
      <td>${l.ms}</td><td><code>${(l.key || '').slice(0, 8)}…</code></td>`
    tb.appendChild(tr)
  })
}

boot()