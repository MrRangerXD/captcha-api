# Captcha Solver

Self-hosted hCaptcha + reCAPTCHA solver. Zero third-party solving services.
Own API, own keys, own dashboard. Runs on Vercel.

## Stack
- Headless Chromium (@sparticuz/chromium + puppeteer-core)
- OpenRouter free vision model (default: `openrouter/free`)
- Upstash Redis (config + tasks + stats)
- Vanilla HTML/CSS/JS dashboard

## Deploy
1. `npm install`
2. `npx vercel link && npx vercel --prod`
3. Vercel Dashboard -> Storage -> Upstash Redis -> Connect
4. Site kholo -> admin password banao
5. Settings -> OpenRouter key paste -> Save
6. API Keys -> Generate

## Endpoints
| Method | Path | Auth |
|---|---|---|
| POST | /api/solve | x-api-key |
| GET | /api/result?id= | x-api-key |
| POST | /api/discord/login | x-admin-token |
| GET/POST/DELETE | /api/keys | x-admin-token |
| GET/PUT | /api/settings | x-admin-token |
| GET | /api/stats | x-admin-token |
| GET | /api/health | none |

## Solve example
```bash
curl -X POST https://APP.vercel.app/api/solve \
  -H "Content-Type: application/json" \
  -H "x-api-key: cs_xxx" \
  -d '{"type":"hcaptcha","sitekey":"...","url":"https://example.com"}'