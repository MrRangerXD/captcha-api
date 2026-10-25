// Standalone CLI — API ke bahar se chalane ke liye
// usage: node scripts/discord-login.mjs you@mail.com 'password'
import { Solver } from '../client/solver.js'

const [, , email, password] = process.argv
const solver = new Solver({ baseUrl: 'https://captchasolverr.vercel.app', apiKey: 'cs_xxx' })

const DISCORD_SITEKEY = 'f5561ba9-8f1e-40ca-9b5b-a0b3f719ef34'

let r = await fetch('https://discord.com/api/v9/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ login: email, password, undelete: false })
})
let d = await r.json()

if (d.captcha_key?.includes('captcha-required')) {
  const token = await solver.hcaptcha(d.captcha_sitekey || DISCORD_SITEKEY, 'https://discord.com/login', { enterprise: true })
  r = await fetch('https://discord.com/api/v9/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Captcha-Key': token,
      'X-Captcha-Rqtoken': d.captcha_rqtoken || ''
    },
    body: JSON.stringify({ login: email, password, undelete: false, captcha_key: token })
  })
  d = await r.json()
}

console.log(JSON.stringify(d, null, 2))