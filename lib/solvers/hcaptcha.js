import { sleep, waitFor } from '../browser.js'
import { askVision, parseIndices, parsePoints, numberElements, clearTags } from '../vision.js'

async function ensureHcaptcha(page) {
  const has = await page.evaluate(() => typeof hcaptcha !== 'undefined' && !!hcaptcha.render).catch(() => false)
  if (has) return
  await page.evaluate(() => new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&hl=en'
    s.async = true
    s.defer = true
    s.onload = resolve
    document.head.appendChild(s)
    setTimeout(resolve, 10000)
  }))
  await waitFor(
    () => page.evaluate(() => typeof hcaptcha !== 'undefined' && !!hcaptcha.render).catch(() => false),
    { label: 'hcaptcha load', timeout: 12000 }
  )
}

export async function solveHcaptcha(page, opts) {
  const { sitekey, url, invisible = false, rqdata } = opts

  // hcaptcha.js — same change
if (!opts.skipGoto) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await ensureHcaptcha(page)

  await page.evaluate(({ sitekey, invisible, rqdata }) => {
    document.querySelectorAll('.__hc_host').forEach((e) => e.remove())
    const d = document.createElement('div')
    d.className = '__hc_host'
    d.style.cssText = 'position:fixed;top:6px;left:6px;z-index:2147483647'
    document.body.appendChild(d)
    window.__hcToken = null
    window.__hcError = null
    const o = {
      sitekey,
      size: invisible ? 'invisible' : 'normal',
      callback: (t) => { window.__hcToken = t },
      'error-callback': () => { window.__hcError = 'widget_error' },
      'expired-callback': () => { window.__hcToken = null }
    }
    if (rqdata) o.rqdata = rqdata
    window.__hcWidget = hcaptcha.render(d, o)
  }, { sitekey, invisible, rqdata })

  if (invisible) {
    const w = await page.evaluate(() => window.__hcWidget)
    await page.evaluate((id) => hcaptcha.execute(id), w)
  } else {
    const cb = await waitFor(
      async () => page.frames().find((f) => /checkbox/i.test(f.url())),
      { label: 'hcaptcha checkbox frame' }
    )
    await cb.click('#checkbox').catch(() => {})
  }

  for (let round = 0; round < 8; round++) {
    const token = await page.evaluate(() => window.__hcToken).catch(() => null)
    if (token) return token

    const err = await page.evaluate(() => window.__hcError).catch(() => null)
    if (err) throw new Error(err)

    const ch = page.frames().find((f) => /challenge/i.test(f.url()))
    if (ch) {
      const open = await ch.evaluate(() => !!document.querySelector('.prompt-text')).catch(() => false)
      if (open) await solveHcChallenge(page, ch)
    }
    await sleep(1500)
  }

  const token = await page.evaluate(() => window.__hcToken).catch(() => null)
  if (!token) throw new Error('hcaptcha_no_token')
  return token
}

async function solveHcChallenge(page, frame) {
  for (let pass = 0; pass < 6; pass++) {
    const kind = await frame.evaluate(() => {
      if (document.querySelector('.challenge-drag')) return 'drag'
      if (document.querySelector('.task-image')) return 'grid'
      if (document.querySelector('.challenge-view')) return 'area'
      return null
    }).catch(() => null)

    if (!kind) return

    const prompt = await frame.evaluate(
      () => (document.querySelector('.prompt-text')?.innerText || '').trim()
    ).catch(() => '')

    if (kind === 'grid') await solveHcGrid(frame, prompt)
    else if (kind === 'area') await solveHcArea(page, frame, prompt)
    else await solveHcDrag(page, frame, prompt)

    await sleep(1600)

    const done = await frame.evaluate(() => !document.querySelector('.prompt-text')).catch(() => true)
    if (done) return
  }
}

async function solveHcGrid(frame, prompt) {
  const info = await frame.evaluate(() => {
    const tiles = [...document.querySelectorAll('.task-image')]
    const cols = Math.round(Math.sqrt(tiles.length)) || 3
    return { count: tiles.length, cols, rows: Math.ceil(tiles.length / (Math.round(Math.sqrt(tiles.length)) || 3)) }
  })
  if (!info.count) return

  const n = await numberElements(frame, '.task-image')
  const box = await frame.$('.challenge-view') || await frame.$('body')
  const shot = await box.screenshot({ type: 'png', encoding: 'base64' })
  await clearTags(frame)

  const answer = await askVision({
    imageBase64: shot,
    instruction:
      `hCaptcha grid: ${info.rows} rows x ${info.cols} columns, tiles numbered 1..${n} ` +
      `left-to-right top-to-bottom, red numbers drawn on the image.\n` +
      `Task: "${prompt}"\n` +
      `Reply with ONLY comma separated tile numbers that match. If none reply exactly: none`
  })

  const idx = parseIndices(answer, n)
  const tiles = await frame.$$('.task-image')
  for (const i of idx) {
    await tiles[i]?.click().catch(() => {})
    await sleep(220)
  }

  const submit = await frame.$('.button-submit')
  await submit?.click().catch(() => {})
  await sleep(2000)
}

async function solveHcArea(page, frame, prompt) {
  const geom = await frame.evaluate(() => {
    const img = document.querySelector('.challenge-view .image, .image-grid .image')
    if (!img) return null
    const r = img.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  if (!geom) return

  const box = await frame.$('.challenge-view')
  const shot = await box.screenshot({ type: 'png', encoding: 'base64' })

  const answer = await askVision({
    imageBase64: shot,
    instruction:
      `Task: "${prompt}"\n` +
      `Give the click points as x,y percentage coordinates inside the image (0-100). ` +
      `Reply ONLY with pairs like: 32,48  71,20`
  })

  const pts = parsePoints(answer)
  if (!pts.length) return

  const iframeHandle = await page.$('iframe[src*="challenge"]')
  const iframeBox = await iframeHandle?.boundingBox()

  for (const p of pts) {
    const x = geom.x + (p.x / 100) * geom.w
    const y = geom.y + (p.y / 100) * geom.h
    if (iframeBox) {
      await page.mouse.click(iframeBox.x + x, iframeBox.y + y)
    } else {
      await frame.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)
        if (!el) return
        for (const t of ['mousedown', 'mouseup', 'click']) {
          el.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: x, clientY: y }))
        }
      }, { x, y })
    }
    await sleep(500)
  }

  const submit = await frame.$('.button-submit')
  await submit?.click().catch(() => {})
  await sleep(2000)
}

async function solveHcDrag(page, frame, prompt) {
  const geom = await frame.evaluate(() => {
    const s = document.querySelector('.drag-source')
    const t = document.querySelector('.drag-target, .drag-target-image')
    const r = s?.getBoundingClientRect()
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
  })
  if (!geom) return

  const shot = await (await frame.$('.challenge-view'))?.screenshot({ type: 'png', encoding: 'base64' })
  const answer = await askVision({
    imageBase64: shot,
    instruction:
      `Task: "${prompt}"\n` +
      `Give the drop point as x,y percentage inside the image (0-100). Reply ONLY like: 40,60`
  })
  const [p] = parsePoints(answer)
  if (!p) return

  const iframeHandle = await page.$('iframe[src*="challenge"]')
  const iframeBox = await iframeHandle?.boundingBox()
  const sx = iframeBox.x + geom.x + geom.w / 2
  const sy = iframeBox.y + geom.y + geom.h / 2
  const tx = iframeBox.x + geom.x + (p.x / 100) * geom.w
  const ty = iframeBox.y + geom.y + (p.y / 100) * geom.h

  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await sleep(150)
  await page.mouse.move(tx, ty, { steps: 18 })
  await sleep(150)
  await page.mouse.up()
  await sleep(1500)

  const submit = await frame.$('.button-submit')
  await submit?.click().catch(() => {})
}