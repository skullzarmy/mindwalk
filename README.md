# 🧠 MindWalk

**Walk through an AI's mind** — an interactive 3D word-cloud game interface
powered by your choice of AI provider.

## What it does

* The AI's last **5 responses** are blended into a **3D spatial word cloud**
  rendered in real-time with Three.js (Fibonacci-sphere layout, glowing
  sprites, star-field background, orbital camera).  Words that recur across
  turns are weighted more prominently, creating a rolling *stream-of-thought*
  that evolves as the session progresses.
* **Click any word** → triggers a configurable *"ponder"* prompt and regenerates
  the cloud from the next AI response.
* **Journey Tracker HUD** — a 10-star progress bar tracks how far into your
  walk you are.  Once you've clicked 5 words you can trigger **Synthesis**
  early; at exactly 10 words it fires automatically.
* **Journey Synthesis** — "The Weaver" AI analyses your complete word path and
  names the hidden pattern as a *Constellation* (e.g. "The Architecture of
  Patience"), plus a one-sentence philosophical insight.
* **Share Journey** — after synthesis, generate a portrait (9:16) or landscape
  (16:9) shareable image and download it or post it to X (Twitter).
* A **sliding chat panel** shows the full conversation history.
* A **journey panel** shows your current word path, lets you save/export/import
  walks, and supports **branching** (click any prior step to fork from there).
* A **settings panel** includes the ponder-prompt template editor, colorblind
  mode, path visualisation options, and the full BYOK key manager (with live
  model fetching for supported providers).
* A manual text input at the bottom lets you start or redirect the conversation
  at any time.

## Quick start

### 1 · Prerequisites

* Node.js ≥ 18
* An API key for **any one** of the supported providers (see below)

### 2 · Install

```bash
npm install
```

### 3 · Configure

```bash
cp .env.example .env
# edit .env — set your API key for the provider of your choice
```

### 4 · Develop

```bash
npm run dev
# Vite frontend → http://localhost:5173
# Express API   → http://localhost:3001
```

## Deploying

### Option A · Docker (recommended)

A multi-stage `Dockerfile` and `docker-compose.yml` are included.

```bash
# Build and start (add your key to the environment first)
OPENAI_API_KEY=sk-… docker compose up -d
```

The app listens on **port 3001** inside the container.  Map it to any host
port you like:

```bash
docker compose up -d            # http://localhost:3001
# or override the port:
PORT=8080 docker compose up -d  # http://localhost:8080
```

To pass a different provider key, uncomment the relevant line in
`docker-compose.yml` (or use a `.env` file alongside it):

```bash
# .env (alongside docker-compose.yml)
ANTHROPIC_API_KEY=sk-ant-…
```

To rebuild after source changes:

```bash
docker compose up -d --build
```

---

### Option B · Node.js (direct)

Requires Node.js ≥ 18.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# edit .env — set your API key

# 3. Build the frontend
npm run build

# 4. Start the server
NODE_ENV=production node server.js
# → http://localhost:3001
```

Override the port with the `PORT` env var:

```bash
PORT=8080 NODE_ENV=production node server.js
```

---

### Environment variables reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the Express server listens on |
| `NODE_ENV` | — | Set to `production` for production builds |
| `AI_PROVIDER` | auto-detect | Pin a provider: `openai` \| `anthropic` \| `google` \| `xai` \| `digitalocean` \| `cloudflare` \| `openrouter` |
| `AI_MAX_TOKENS` | `150` | Maximum tokens per AI response |
| `TOKEN_QUOTA_PER_HOUR` | `10000` | Hourly token budget per IP |
| `OPENAI_API_KEY` | — | OpenAI key |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model override |
| `ANTHROPIC_API_KEY` | — | Anthropic key |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` | Anthropic model override |
| `GOOGLE_API_KEY` | — | Google Gemini key |
| `GOOGLE_MODEL` | `gemini-flash-lite-latest` | Google model override |
| `XAI_API_KEY` | — | xAI / Grok key |
| `XAI_MODEL` | `grok-3-mini-latest` | xAI model override |
| `DIGITALOCEAN_API_KEY` | — | DigitalOcean GenAI key |
| `DIGITALOCEAN_BASE_URL` | — | DigitalOcean agent endpoint URL (**required** for this provider) |
| `DIGITALOCEAN_MODEL` | `deepseek-r1-distill-llama-70b` | DigitalOcean model override |
| `CLOUDFLARE_API_KEY` | — | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | — | Cloudflare account ID |
| `CLOUDFLARE_GATEWAY_ID` | — | Optional: Cloudflare AI Gateway ID |
| `CLOUDFLARE_MODEL` | `@cf/meta/llama-4-scout-17b-16e-instruct` | Cloudflare model override |
| `OPENROUTER_API_KEY` | — | OpenRouter key |
| `OPENROUTER_MODEL` | `meta-llama/llama-4-maverick:free` | OpenRouter model override |

> **BYOK-only mode:** Leave all provider keys unset and the server starts
> without an API key.  Users are guided through a 3-step in-browser wizard to
> enter and optionally encrypt their own key.  No key ever reaches the server in
> this mode.

---

## Supported AI Providers

The server auto-detects which provider to use from whichever key is set in
`.env`.  You can also pin a specific provider with `AI_PROVIDER=<name>`.

| `AI_PROVIDER` value | Provider | Key env var | Default model |
|---|---|---|---|
| `openai` | [OpenAI](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` | `gpt-4o-mini` |
| `anthropic` | [Anthropic](https://console.anthropic.com/) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` |
| `google` | [Google Gemini](https://aistudio.google.com/app/apikey) | `GOOGLE_API_KEY` | `gemini-flash-lite-latest` |
| `xai` | [xAI / Grok](https://console.x.ai/) | `XAI_API_KEY` | `grok-3-mini-latest` |
| `digitalocean` | [DigitalOcean GenAI](https://cloud.digitalocean.com/gen-ai) | `DIGITALOCEAN_API_KEY` | `deepseek-r1-distill-llama-70b` |
| `cloudflare` | [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) / [AI Gateway](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/) | `CLOUDFLARE_API_KEY` | `@cf/meta/llama-4-scout-17b-16e-instruct` |
| `openrouter` | [OpenRouter](https://openrouter.ai/keys) (unified billing) | `OPENROUTER_API_KEY` | `meta-llama/llama-4-maverick:free` |

> **Cloudflare AI Gateway**: set `CLOUDFLARE_GATEWAY_ID` to route requests through the AI Gateway (`gateway.ai.cloudflare.com`) instead of the direct Workers AI REST API. The Gateway provides an OpenAI-compatible chat completions interface with built-in caching, rate limiting, and analytics.

Override the model with the corresponding `*_MODEL` env var (e.g.
`ANTHROPIC_MODEL=claude-opus-4-5`).

> **DigitalOcean** is a server-only provider — it is not available in BYOK
> (browser-direct) mode and requires `DIGITALOCEAN_BASE_URL` pointing at your
> GenAI agent endpoint.

### Token budget

Responses are capped at **150 tokens** by default to keep word-cloud output
concise.  Override with `AI_MAX_TOKENS=<number>` in `.env`.

## Architecture

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| 3D rendering | Three.js (sprites, OrbitControls, AdditiveBlending) |
| Backend | Express.js (AI provider proxy, keeps API keys server-side) |
| Styling | CSS custom properties, cyberpunk/space game aesthetic |
| Share images | Client-side Canvas 2D API (`generateShareImage.js`) |

## Controls

| Action | Result |
|---|---|
| **Click word** | Ponder that word (sends prompt to AI) |
| **Drag** | Orbit the word cloud |
| **Scroll** | Zoom in / out |
| **🧠 MINDWALK** | Toggle the welcome / about panel |
| **💬 CHAT** | View full conversation history |
| **🗺 JOURNEY** | Manage current path, save, export, import, or branch |
| **⚙ SETTINGS** | Edit ponder-prompt template, manage BYOK key, toggle colorblind mode, path style |
| **Type + EXPLORE** | Send a freeform thought |
| **★ stars (HUD)** | Shows progress toward Journey Synthesis (10 words) |
| **SYNTHESIZE JOURNEY ✨** | Trigger synthesis early (available after 5+ words) |

## Journey Synthesis

After exploring **10 concepts** (or tapping **SYNTHESIZE JOURNEY ✨** at 5+),
MindWalk activates "The Weaver" — a special AI prompt that analyses the entire
word path, identifies the overarching narrative, and returns:

* **Constellation name** — a striking 2–4 word label for the thought pattern
  (e.g. "The Architecture of Patience").
* **Philosophical insight** — a single punchy sentence about how the concepts
  weave together.

### Sharing your journey

After synthesis a share dialog lets you:

* Toggle between **Stories (9:16)** and **Poster (16:9)** image formats.
* **Download** the card as a PNG.
* **Share on X** (Twitter) with a pre-filled caption.

## Rate limiting

MindWalk's server enforces layered rate limits to prevent abuse and control AI API costs.

### Request limits (per IP)

| Endpoint | Window | Limit | Who it protects |
|---|---|---|---|
| `POST /api/chat` (server key) | 15 min | **20 requests** | Server API budget |
| `POST /api/synthesize` (server key) | 15 min | **20 requests** (shared with `/api/chat`) | Server API budget |
| `POST /api/chat` (BYOK¹) | 15 min | **50 requests** | Fair-use for self-funded calls |
| `GET /api/config` | 15 min | 100 requests | Config polling |
| SPA static fallback | 1 min | 200 requests | File-system flooding |

¹ BYOK requests must include the `X-MindWalk-BYOK: true` header.

### Token quota (per IP, per hour)

In addition to request-count limits, the server tracks an estimated token spend
per IP and rejects requests that would exceed **10,000 tokens / hour** (default).
Tokens are estimated at **4 characters ≈ 1 token** — no external dependency required.

Override the hourly token budget with the `TOKEN_QUOTA_PER_HOUR` env var:

```bash
TOKEN_QUOTA_PER_HOUR=5000  # stricter budget
```

### Rate-limit response headers

Every `/api/chat` and `/api/config` response includes standard rate-limit
headers so clients can pace themselves:

| Header | Meaning |
|---|---|
| `RateLimit-Limit` | Maximum requests allowed in the current window |
| `RateLimit-Remaining` | Requests remaining in the current window |
| `RateLimit-Reset` | Timestamp when the window resets |
| `Retry-After` | Seconds to wait after a 429 token-quota response |

When a limit is exceeded the server returns `HTTP 429` with a JSON body.
There are two distinct 429 shapes depending on which limit was hit:

**Request-count limit** (applies to all rate-limited endpoints):

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": "3 minute(s)",
  "hint": "MindWalk limits requests to prevent abuse. Try again shortly."
}
```

`retryAfter` reflects the actual time remaining in the current window (e.g.
`"3 minute(s)"` or `"45 second(s)"`), not a fixed interval.

**Token quota limit** (`/api/chat` only — hourly token budget):

```json
{
  "error": "Token quota exceeded",
  "retryAfter": "42 minute(s)",
  "hint": "You have used your hourly token budget. Try again in about 42 minute(s)."
}
```

Token-quota responses also include a `Retry-After` header with the number of
seconds until the quota window resets.

## Security model (BYOK mode)

When the server is run without a provider API key, MindWalk enters **BYOK
(Bring Your Own Key) mode**.  Users enter their own key in the Settings panel.
The following hardening measures protect that key:

### HTTP security headers (server.js)

Every response sets:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'` + allowlisted AI-provider origins |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

CSP prevents injected scripts from exfiltrating keys even if an XSS
vulnerability exists somewhere in the dependency tree.

### BYOK-supported providers

In BYOK mode the browser calls the AI provider directly (the key never touches
the server).  The following providers are supported:

| Provider | Key format |
|---|---|
| OpenAI | `sk-…` |
| Anthropic Claude | `sk-ant-…` |
| Google Gemini | `AIza…` |
| xAI / Grok | `xai-…` |
| OpenRouter | `sk-or-…` |
| Cloudflare Workers AI | `accountId:apiToken` |
| Cloudflare AI Gateway | `accountId:gatewayId:apiToken` |

> **DigitalOcean GenAI** is a server-only provider and is not available in
> BYOK mode.

For providers that expose a `/models` endpoint (OpenAI, Anthropic, Google,
xAI, OpenRouter, Cloudflare Workers AI), the Settings panel can **fetch the
live model list** so you can pick any model available to your key.

### Key storage options (client)

Users choose how their key is stored:

| Mode | Mechanism | Cleared |
|---|---|---|
| **Session only** (default) | `sessionStorage` | When the tab closes |
| **Remember key** | AES-256-GCM encrypted in IndexedDB (Web Crypto API, PBKDF2 key derivation, 100,000 iterations) | Never (until manually cleared) |

**The API key is never written to `localStorage` in plain text.**  On page
load, if an encrypted key is found, the user is prompted for the passphrase
before the key is loaded into memory.  The passphrase itself never leaves the
browser.

### Legacy migration

If a key was stored in plain-text `localStorage` by an older version of the
app, it is automatically migrated to `sessionStorage` (session-only) and the
plain-text copy is scrubbed from `localStorage` on first load.

## License

MindWalk is released into the public domain under the
[Unlicense](LICENSE).  Do whatever you want with it.
