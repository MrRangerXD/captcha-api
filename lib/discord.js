import { sleep } from './browser.js'
import { solveHcaptcha } from './solvers/hcaptcha.js'

const SUPER_PROPS = {
  os: 'Windows', browser: 'Chrome', device: '', system_locale: 'en-US',
  browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  browser_version: '131.0.0.0', os_version: '10', referrer: '', referring_domain: '',
  referrer_current: '', referring_domain_current: '', release_channel: 'stable',
  client_build_number: 340000, client_event_source: null
}

export async function discordLogin(page, { email, password, mfaCode, invite }) {
  await page.goto('https://discord.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(2500)

  const attempt = (captchaKey) => page.evaluate(async ({ email, password, captchaKey, SUPER_PROPS, mfaCode }) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Super-Properties': btoa(JSON.stringify(SUPER_PROPS)),
      'X-Discord-Locale': 'en-US',
      'X-Debug-Options': 'bugReporterEnabled'
    }
    const body = { login: email, password, undelete: false }
    if (captchaKey) body.captcha_key = captchaKey
    if (mfaCode) body.mfa_code = mfaCode

    const r = await fetch('/api/v9/auth/login', { method: 'POST', headers, body: JSON.stringify(body) })
    return { status: r.status, data: await r.json().catch(() => ({})) }
  }, { email, password, captchaKey, SUPER_PROPS, mfaCode })

  let res = await attempt(null)
  let captchaSolved = false

  for (let i = 0; i < 3; i++) {
    const d = res.data || {}
    if (d.captcha_key?.includes('captcha-required')) {
      const token = await solveHcaptcha(page, {
        sitekey: d.captcha_sitekey,
        url: 'https://discord.com/login',
        enterprise: true,
        skipGoto: true
      })
      captchaSolved = true
      res = await attempt(token)
      continue
    }
    if (d.mfa_required && !mfaCode) {
      return { ok: false, stage: 'mfa_required', mfa_ticket: d.mfa_ticket, cookies: await dumpCookies(page), captchaSolved }
    }
    break
  }

  const d = res.data || {}
  if (d.token) {
    let user = null
    try {
      user = await page.evaluate(async (t) => {
        const r = await fetch('/api/v9/users/@me', { headers: { Authorization: t } })
        return r.ok ? r.json() : null
      }, d.token)
    } catch {}

    let joined = null
    if (invite) {
      try {
        joined = await page.evaluate(async ({ t, invite }) => {
          const r = await fetch(`/api/v9/invites/${invite}`, {
            method: 'POST',
            headers: { Authorization: t, 'Content-Type': 'application/json' }
          })
          return { status: r.status, body: await r.json().catch(() => ({})) }
        }, { t: d.token, invite })
      } catch {}
    }

    return { ok: true, token: d.token, user, joined, cookies: await dumpCookies(page), captchaSolved }
  }

  return { ok: false, stage: 'failed', status: res.status, error: d, captchaSolved }
}

async function dumpCookies(page) {
  const cs = await page.cookies()
  return cs.map((c) => `${c.name}=${c.value}`).join('; ')
}