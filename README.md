# 🧠 MindWalk

**Walk through an AI's mind** — an interactive 3D word-cloud game interface
powered by your choice of AI provider.

## What it does

* The AI's last response is parsed into a **3D spatial word cloud** rendered in
  real-time with Three.js (Fibonacci-sphere layout, glowing sprites, star-field
  background, orbital camera).
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
| `cloudflare` | [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) | `CLOUDFLARE_API_KEY` | `@cf/meta/llama-3.1-8b-instruct` |
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
