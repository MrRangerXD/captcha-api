import { sleep, waitFor } from '../browser.js'
import { askVision, parseIndices, numberElements, clearTags } from '../vision.js'

async function ensureGrecaptcha(page) {
  const has = await page.evaluate(() => typeof grecaptcha !== 'undefined' && !!grecaptcha.render).catch(() => false)
  if (has) return
  await page.evaluate(() => new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = 'https://www.google.com/recaptcha/api.js?render=explicit&hl=en'
    s.async = true
    s.onload = resolve
    document.head.appendChild(s)
    setTimeout(resolve, 10000)
  }))
  await waitFor(
    () => page.evaluate(() => typeof grecaptcha !== 'undefined' && !!grecaptcha.render).catch(() => false),
    { label: 'grecaptcha load', timeout: 12000 }
  )
}

export async function solveRecaptcha(page, opts) {
  const {
    type = 'recaptcha_v2', sitekey, url,
    action = 'verify', invisible = false
  } = opts

  // recaptcha.js — sirf ye line badlo
if (!opts.skipGoto) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await ensureGrecaptcha(page)

  // ---------- v3 : no image challenge needed ----------
  if (type === 'recaptcha_v3') {
    return page.evaluate(async ({ sitekey, action }) => {
      await new Promise((r) => grecaptcha.ready(r))
      return grecaptcha.execute(sitekey, { action })
    }, { sitekey, action })
  }

  // ---------- v2 ----------
  await page.evaluate(({ sitekey, invisible }) => {
    document.querySelectorAll('.__rc_host').forEach((e) => e.remove())
    const d = document.createElement('div')
    d.className = '__rc_host'
    d.style.cssText = 'position:fixed;top:6px;left:6px;z-index:2147483647;background:#fff;padding:4px;border-radius:4px'
    document.body.appendChild(d)
    window.__rcToken = null
    window.__rcError = null
    window.__rcWidget = grecaptcha.render(d, {
      sitekey,
      size: invisible ? 'invisible' : 'normal',
      badge: 'inline',
      callback: (t) => { window.__rcToken = t },
      'error-callback': () => { window.__rcError = 'widget_error' }
    })
  }, { sitekey, invisible })

  if (invisible) {
    await page.evaluate((w) => grecaptcha.execute(w), await page.evaluate(() => window.__rcWidget))
  } else {
    const anchor = await waitFor(
      async () => page.frames().find((f) => f.url().includes('/recaptcha/api2/anchor')),
      { label: 'anchor frame' }
    )
    await anchor.click('#recaptcha-anchor').catch(() => {})
  }

  for (let round = 0; round < 7; round++) {
    const token = await page.evaluate(() => window.__rcToken).catch(() => null)
    if (token) return token

    const err = await page.evaluate(() => window.__rcError).catch(() => null)
    if (err) throw new Error(err)

    const bframe = page.frames().find((f) => f.url().includes('/recaptcha/api2/bframe'))
    if (bframe) {
      const open = await bframe.evaluate(() => {
        const el = document.querySelector('#rc-imageselect')
        return !!(el && el.offsetParent !== null)
      }).catch(() => false)
      if (open) await solveGridChallenge(bframe)
    }
    await sleep(1500)
  }

  const token = await page.evaluate(() => window.__rcToken).catch(() => null)
  if (!token) throw new Error('recaptcha_no_token')
  return token
}

async function solveGridChallenge(frame) {
  for (let pass = 0; pass < 5; pass++) {
    const info = await frame.evaluate(() => {
      const table = document.querySelector('#rc-imageselect-target table')
      if (!table) return null
      const m = (table.className || '').match(/rc-imageselect-table-(\d)(\d)/)
      const promptEl = document.querySelector('.rc-imageselect-desc-no-canonical, .rc-imageselect-desc')
      const cells = [...document.querySelectorAll('#rc-imageselect-target table td')]
      return {
        cols: m ? Number(m[1]) : 3,
        rows: m ? Number(m[2]) : 3,
        prompt: (promptEl?.innerText || '').trim(),
        count: cells.length,
        dynamic: /none left|click verify|until there are none|once there are none/i.test(promptEl?.innerText || '')
      }
    }).catch(() => null)

    if (!info || !info.count) return

    const n = await numberElements(frame, '#rc-imageselect-target table td')
    const el = await frame.$('#rc-imageselect-target')
    const shot = await el.screenshot({ type: 'png', encoding: 'base64' })
    await clearTags(frame)

    const answer = await askVision({
      imageBase64: shot,
      instruction:
        `CAPTCHA grid: ${info.rows} rows x ${info.cols} columns. Tiles are numbered 1..${n} ` +
        `left-to-right, top-to-bottom, numbers drawn in red on the image.\n` +
        `Task: "${info.prompt}"\n` +
        `Reply with ONLY comma separated tile numbers that match. If none match reply exactly: none`
    })

    const idx = parseIndices(answer, n)
    const cells = await frame.$$('#rc-imageselect-target table td')

    if (info.dynamic && idx.length === 0) {
      const v = await frame.$('#recaptcha-verify-button')
      await v?.click().catch(() => {})
      await sleep(2000)
      return
    }

    for (const i of idx) {
      await cells[i]?.click().catch(() => {})
      await sleep(280)
    }

    if (info.dynamic) { await sleep(1300); continue }

    const verify = await frame.$('#recaptcha-verify-button')
    await verify?.click().catch(() => {})
    await sleep(2200)

    const stillOpen = await frame.evaluate(() => {
      const el = document.querySelector('#rc-imageselect')
      return !!(el && el.offsetParent !== null)
    }).catch(() => false)
    if (!stillOpen) return
  }
}