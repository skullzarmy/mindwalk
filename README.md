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
* A **sliding chat panel** (left) shows the full conversation history.
* A **prompt editor panel** (right) lets you edit and save the ponder-prompt
  template (`{WORD}` is replaced with the clicked word).
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

### 5 · Production build

```bash
npm run build
NODE_ENV=production node server.js
```

## Supported AI Providers

The server auto-detects which provider to use from whichever key is set in
`.env`.  You can also pin a specific provider with `AI_PROVIDER=<name>`.

| `AI_PROVIDER` value | Provider | Key env var | Default model |
|---|---|---|---|
| `openai` | [OpenAI](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` | `gpt-3.5-turbo` |
| `anthropic` | [Anthropic](https://console.anthropic.com/) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` |
| `google` | [Google Gemini](https://aistudio.google.com/app/apikey) | `GOOGLE_API_KEY` | `gemini-1.5-flash` |
| `xai` | [xAI / Grok](https://console.x.ai/) | `XAI_API_KEY` | `grok-3-mini` |
| `digitalocean` | [DigitalOcean GenAI](https://cloud.digitalocean.com/gen-ai) | `DIGITALOCEAN_API_KEY` | configurable |
| `cloudflare` | [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) / [AI Gateway](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/) | `CLOUDFLARE_API_KEY` | `@cf/meta/llama-3.1-8b-instruct` |

> **Cloudflare AI Gateway**: set `CLOUDFLARE_GATEWAY_ID` to route requests through the AI Gateway (`gateway.ai.cloudflare.com`) instead of the direct Workers AI REST API. The Gateway provides an OpenAI-compatible chat completions interface with built-in caching, rate limiting, and analytics.
| `openrouter` | [OpenRouter](https://openrouter.ai/keys) (unified billing) | `OPENROUTER_API_KEY` | `openai/gpt-3.5-turbo` |

Override the model with the corresponding `*_MODEL` env var (e.g.
`ANTHROPIC_MODEL=claude-opus-4-5`).

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

## Controls

| Action | Result |
|---|---|
| **Click word** | Ponder that word (sends prompt to AI) |
| **Drag** | Orbit the word cloud |
| **Scroll** | Zoom in / out |
| **⚙ PROMPT** | Edit the ponder-prompt template |
| **💬 CHAT** | View full conversation history |
| **Type + EXPLORE** | Send a freeform thought |

## Rate limiting

MindWalk's server enforces layered rate limits to prevent abuse and control AI API costs.

### Request limits (per IP)

| Endpoint | Window | Limit | Who it protects |
|---|---|---|---|
| `POST /api/chat` (server key) | 15 min | **20 requests** | Server API budget |
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

When a limit is exceeded the server returns `HTTP 429` with a JSON body:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": "15 minutes",
  "hint": "MindWalk limits requests to prevent abuse. Try again shortly."
}
```

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
