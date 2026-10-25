export class Solver {
  constructor({ baseUrl, apiKey, timeout = 120 }) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
    this.timeout = timeout * 1000
  }

  async #req(method, path, body) {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
      body: body ? JSON.stringify(body) : undefined
    })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  }

  async solve(params) {
    const { status, json } = await this.#req('POST', '/api/solve', params)
    if (status === 200 && json.token) return json.token
    if (!json.taskId) throw new Error(json.error || `HTTP ${status}`)
    return this.#poll(json.taskId)
  }

  async #poll(taskId) {
    const end = Date.now() + this.timeout
    while (Date.now() < end) {
      const { json } = await this.#req('GET', `/api/result?id=${taskId}`)
      if (json.status === 'ready') return json.token
      if (json.status === 'error') throw new Error(json.error)
      await new Promise((r) => setTimeout(r, 2500))
    }
    throw new Error('timeout')
  }

  hcaptcha(sitekey, url, o = {}) { return this.solve({ type: 'hcaptcha', sitekey, url, ...o }) }
  recaptchaV2(sitekey, url, o = {}) { return this.solve({ type: 'recaptcha_v2', sitekey, url, ...o }) }
  recaptchaV3(sitekey, url, action = 'verify', o = {}) { return this.solve({ type: 'recaptcha_v3', sitekey, url, action, ...o }) }
}