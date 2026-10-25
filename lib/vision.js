const BASE = 'https://openrouter.ai/api/v1'

async function cfg() {
  const { getConfig } = await import('./config.js')
  return getConfig()
}

export async function askVision({ imageBase64, instruction, maxTokens = 90 }) {
  const c = await cfg()
  if (!c.openrouterKey) throw new Error('openrouter_key_missing')

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${c.openrouterKey}`,
      'HTTP-Referer': 'https://captchasolverr.vercel.app',
      'X-Title': 'Captcha Solver'
    },
    body: JSON.stringify({
      model: c.model || 'openrouter/free',
      temperature: 0,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: instruction },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
        ]
      }]
    })
  })

  if (!res.ok) throw new Error(`vision_${res.status}:${(await res.text()).slice(0, 180)}`)
  const j = await res.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

export function parseIndices(text, max) {
  if (/^\s*none\s*$/i.test(text)) return []
  return [...new Set((text.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= max))].map((n) => n - 1)
}

export function parsePoints(text) {
  const nums = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number)
  const out = []
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] })
  return out
}

export async function numberElements(frame, selector) {
  return frame.evaluate((sel) => {
    document.querySelectorAll('.__numtag').forEach((e) => e.remove())
    const els = [...document.querySelectorAll(sel)]
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const t = document.createElement('div')
      t.className = '__numtag'
      t.textContent = String(i + 1)
      t.style.cssText =
        `position:fixed;z-index:2147483647;pointer-events:none;background:#ff2d55;color:#fff;` +
        `font:bold 15px monospace;padding:1px 5px;border-radius:4px;border:1px solid #fff;` +
        `left:${r.left + 3}px;top:${r.top + 3}px`
      document.body.appendChild(t)
    })
    return els.length
  }, selector)
}

export async function clearTags(frame) {
  await frame.evaluate(() => document.querySelectorAll('.__numtag').forEach((e) => e.remove())).catch(() => {})
}