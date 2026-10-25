export default function handler(req, res) {
  res.json({ ok: true, service: 'captcha-solver', time: new Date().toISOString() })
}