# Copilot Instructions for MindWalk

## What This Project Is

**MindWalk** is an interactive 3D word-cloud explorer that visualizes an AI's "stream of thought." Users click words in a Fibonacci-sphere cloud, which triggers AI "ponder" prompts, blending the last 5 AI responses into an evolving cloud. The journey is tracked, saveable, exportable, and resumable.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| 3D Rendering | Three.js (sprites, OrbitControls, Fibonacci-sphere) |
| Backend | Express.js (multi-provider AI proxy) |
| Styling | Plain CSS with custom properties (cyberpunk/space aesthetic) |
| Storage | localStorage, sessionStorage, IndexedDB (AES-256-GCM encrypted) |
| Crypto | Web Crypto API (PBKDF2 key derivation, 100,000 iterations) |
| Build | Vite (dev server proxies `/api` → Express on port 3001) |

## Repository Layout

```
mindwalk/
├── index.html              # Vite/React entry point
├── package.json            # Scripts & dependencies
├── vite.config.js          # Vite config; /api proxy to localhost:3001
├── server.js               # Express backend (AI proxy, rate-limiting, static serving)
├── .env.example            # All supported env vars with comments
└── src/
    ├── main.jsx            # React bootstrap
    ├── App.jsx             # Root component; orchestrates all state & data flow
    ├── components/
    │   ├── WordCloud3D.jsx  # Three.js 3D cloud; path visualization
    │   ├── SettingsPanel.jsx# BYOK wizard (3-step); prompt & style settings
    │   ├── JourneyPanel.jsx # Save / load / export / import walks
    │   ├── ChatPanel.jsx    # Scrollable conversation history
    │   └── PromptEditor.jsx # {WORD}/{PATH} template editor
    ├── styles/
    │   └── main.css        # ~1,400 lines; CSS custom properties, responsive, a11y
    └── utils/
        ├── aiClient.js      # Browser-side direct AI calls (BYOK)
        ├── aiSettings.js    # Non-sensitive settings; in-memory key holder
        ├── secureStorage.js # IndexedDB encryption helpers
        ├── textProcessing.js# Word-frequency extraction, stop-word filter
        ├── walkStorage.js   # Journey persistence (localStorage, max 20 walks)
        └── memoryMonitor.js # Dev-only heap growth watcher
```

## How to Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set at least one AI provider key, or leave blank for BYOK-only mode

# 3. Start full dev stack (Vite on :5173 + Express on :3001)
npm run dev

# Individual processes
npm run dev:frontend   # Vite only
npm run dev:server     # Express only (nodemon watch)

# Production
npm run build          # Vite → ./dist/
node server.js         # Serves dist/ + /api routes
```

No test runner is configured. There are no unit or integration tests in this repo — validate changes by running the dev server and exercising the UI manually.

## Supported AI Providers

The app supports seven providers, auto-detected from environment variable key names:

| Provider | Env var | Notes |
|----------|---------|-------|
| OpenAI | `OPENAI_API_KEY` | GPT-3.5-turbo |
| Anthropic | `ANTHROPIC_API_KEY` | Claude Haiku |
| Google | `GOOGLE_API_KEY` | gemini-1.5-flash |
| xAI | `XAI_API_KEY` | grok-3-mini |
| OpenRouter | `OPENROUTER_API_KEY` | unified billing |
| Cloudflare | `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` | Workers AI or AI Gateway |
| DigitalOcean | `DIGITALOCEAN_API_KEY` | GenAI |

Override with `AI_PROVIDER=openai` (or any provider slug). Override token limit with `AI_MAX_TOKENS=150`.

## Key Architectural Patterns

### Data flow
```
User clicks word
  → handleWordClick() in App.jsx
  → build prompt ({WORD}/{PATH} substitution from template)
  → sendMessage(prompt)
      [BYOK]  callAIClient() in aiClient.js  → direct browser → AI provider
      [Server key] POST /api/chat            → Express proxy → AI provider
  → extract words from last 5 responses (STREAM_DEPTH constant)
  → update Three.js cloud
  → append to ChatPanel conversation log
```

### BYOK vs. server-key mode
- `GET /api/config` tells the client whether the server has its own API key.
- When the server has no key, the app enters "BYOK wizard" mode (3-step: provider → key → storage).
- The user's key **never touches the server**; it is used only in the browser via `aiClient.js`.
- Storage choices: session-only (sessionStorage) or encrypted (IndexedDB, passphrase-locked).

### API key security rules (do not weaken these)
- API keys are **never stored in plain localStorage**.
- `aiSettings.js` holds the in-memory key in `_memApiKey`; it is never serialized.
- Encrypted storage uses AES-256-GCM with PBKDF2 (100,000 iterations); salt is stored separately.
- If you add a new storage pathway, follow the same encryption pattern in `secureStorage.js`.

### CSS conventions
- All colours are CSS custom properties defined in `:root` (dark theme default).
- Light mode is an override block (`@media (prefers-color-scheme: light)` + `.light-mode` class).
- Safe-area insets use the pattern:
  ```css
  padding: 12px;
  padding-top: max(12px, env(safe-area-inset-top));
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  /* etc. */
  ```
  This pattern is repeated at every responsive breakpoint for `.hud-header` and `.bottom-bar`.
- Do **not** use Tailwind or CSS Modules; keep all styles in `src/styles/main.css`.

### Three.js memory management (WordCloud3D.jsx)
- Every geometry, material, and texture created inside effects **must** be disposed in the cleanup function.
- Use `renderer.renderLists.dispose()` before re-building the scene.
- `memoryMonitor.js` is dev-only; never import it in production paths.

### Word extraction
- `textProcessing.js` filters stop words (~100 words), enforces 3–25 char length, alphabetic only.
- Returns top 40 words weighted by frequency (0–1).
- Do not lower this cap without considering Three.js sprite count performance.

### Journey / walk storage
- Max 20 saved walks (FIFO eviction) — defined by `MAX_WALKS` in `walkStorage.js`.
- Export format: `{ version, exportedAt, path: string[] }`.
- Import validates JSON, path length, and sanitizes each word.

### Rate limiting (server.js)
- Two layers: request count (20/15 min server key, 50/15 min BYOK) and token quota (10 000 tokens/hr default).
- Token estimation: 1 token ≈ 4 characters.
- Do not remove or loosen these defaults; they protect shared-key deployments.

## Environment Variables Reference

```
PORT=3001
NODE_ENV=development|production
AI_PROVIDER=          # auto-detect if omitted
AI_MAX_TOKENS=150
TOKEN_QUOTA_PER_HOUR=10000     # default 10,000 tokens/hr

# Provider keys (set exactly one for server-key mode)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
XAI_API_KEY=
OPENROUTER_API_KEY=
CLOUDFLARE_API_KEY=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_GATEWAY_ID=   # optional
DIGITALOCEAN_API_KEY=
```

## No CI/CD Pipeline

There is no `.github/workflows/` directory. There is no linter, formatter, or automated test suite configured. Validate all changes by running `npm run dev` and testing the UI interactively. When adding features:

1. Run `npm run build` to confirm there are no Vite/React compilation errors.
2. Start `node server.js` in production mode and verify `/api/chat` still works.
3. Test both server-key mode (with a key in `.env`) and BYOK mode (no key in `.env`).

## Known Issues / Gotchas

- **No automated tests** — all validation is manual.
- `memoryMonitor.js` only works in Chromium (uses `performance.memory` which is non-standard).
- `mindwalk-analysis.md` and `mindwalk-release-plan.md` are planning documents, not authoritative specs; the code is the ground truth.
- The `STREAM_DEPTH = 5` constant in `App.jsx` controls how many past AI responses are blended into the cloud; changing it affects memory usage and cloud coherence.
- Rate-limit headers (`RateLimit-*`) are set in `server.js`; if you add a new endpoint, apply the same rate-limiter middleware.
- CORS in `server.js` is currently set to allow all origins in development; tighten this for production deployments.
