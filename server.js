import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ── AI Provider Configuration ─────────────────────────────────────────────────
// Each entry describes defaults for a supported provider.
// OpenAI-compatible providers (openai, xai, digitalocean, openrouter) share the
// same request/response shape; anthropic, google, and cloudflare are normalised
// server-side so the frontend always receives the OpenAI response envelope.
const PROVIDER_DEFAULTS = {
  openai:       { baseUrl: 'https://api.openai.com/v1',                           model: 'gpt-3.5-turbo',                  keyVar: 'OPENAI_API_KEY',       modelVar: 'OPENAI_MODEL' },
  anthropic:    { baseUrl: 'https://api.anthropic.com/v1',                        model: 'claude-haiku-4-5',               keyVar: 'ANTHROPIC_API_KEY',    modelVar: 'ANTHROPIC_MODEL' },
  google:       { baseUrl: 'https://generativelanguage.googleapis.com/v1beta',    model: 'gemini-1.5-flash',               keyVar: 'GOOGLE_API_KEY',       modelVar: 'GOOGLE_MODEL' },
  xai:          { baseUrl: 'https://api.x.ai/v1',                                 model: 'grok-3-mini',                    keyVar: 'XAI_API_KEY',          modelVar: 'XAI_MODEL' },
  digitalocean: { baseUrl: '',                                                     model: 'n8n-meta-llama-3-1-70b-instruct',keyVar: 'DIGITALOCEAN_API_KEY', modelVar: 'DIGITALOCEAN_MODEL' },
  cloudflare:   { baseUrl: '',                                                     model: '@cf/meta/llama-3.1-8b-instruct', keyVar: 'CLOUDFLARE_API_KEY',   modelVar: 'CLOUDFLARE_MODEL' },
  openrouter:   { baseUrl: 'https://openrouter.ai/api/v1',                        model: 'openai/gpt-3.5-turbo',           keyVar: 'OPENROUTER_API_KEY',   modelVar: 'OPENROUTER_MODEL' },
};

// Placeholder values that indicate a key has not been filled in
const PLACEHOLDER_PATTERNS = ['your-key', 'your_key', 'placeholder', 'changeme', 'xxx'];
function isPlaceholder(val) {
  return !val || PLACEHOLDER_PATTERNS.some(p => val.toLowerCase().includes(p));
}

// Auto-detect which provider to use based on configured env vars.
// Explicit AI_PROVIDER always wins; otherwise the first provider whose key is
// set (and not a placeholder) is used; falls back to 'openai'.
function selectProvider() {
  const explicit = (process.env.AI_PROVIDER || '').toLowerCase();
  if (explicit && PROVIDER_DEFAULTS[explicit]) return explicit;
  for (const [name, cfg] of Object.entries(PROVIDER_DEFAULTS)) {
    if (!isPlaceholder(process.env[cfg.keyVar])) return name;
  }
  return 'openai';
}

// ── OpenAI-compatible call (openai / xai / digitalocean / openrouter) ─────────
async function callOpenAICompatible(provider, messages, maxTokens) {
  const cfg = PROVIDER_DEFAULTS[provider];
  const apiKey = process.env[cfg.keyVar];
  const model = process.env[cfg.modelVar] || cfg.model;
  let baseUrl = cfg.baseUrl;
  if (provider === 'digitalocean') {
    baseUrl = process.env.DIGITALOCEAN_BASE_URL || '';
    if (!baseUrl) throw new Error('DIGITALOCEAN_BASE_URL is required for the digitalocean provider');
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.85 }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `${provider} API error`);
  return data; // already OpenAI envelope
}

// ── Anthropic ─────────────────────────────────────────────────────────────────
async function callAnthropic(messages, maxTokens) {
  const cfg = PROVIDER_DEFAULTS.anthropic;
  const apiKey = process.env[cfg.keyVar];
  const model = process.env[cfg.modelVar] || cfg.model;

  const systemMsg = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');
  const body = { model, max_tokens: maxTokens, messages: userMessages, temperature: 0.85 };
  if (systemMsg) body.system = systemMsg.content;

  const response = await fetch(`${cfg.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Anthropic API error');
  // Normalise to OpenAI envelope
  return { choices: [{ message: { role: 'assistant', content: data.content[0].text } }] };
}

// ── Google Gemini ─────────────────────────────────────────────────────────────
async function callGoogle(messages, maxTokens) {
  const cfg = PROVIDER_DEFAULTS.google;
  const apiKey = process.env[cfg.keyVar];
  const model = process.env[cfg.modelVar] || cfg.model;

  const systemMsg = messages.find(m => m.role === 'system');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85 } };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

  const response = await fetch(
    `${cfg.baseUrl}/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Google Gemini API error');
  const text = data.candidates[0].content.parts[0].text;
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}

// ── Cloudflare Workers AI / AI Gateway ───────────────────────────────────────
// When CLOUDFLARE_GATEWAY_ID is set the request is routed through the
// Cloudflare AI Gateway (https://developers.cloudflare.com/ai-gateway/usage/chat-completion/)
// which exposes an OpenAI-compatible chat completions endpoint and returns the
// standard OpenAI response envelope directly.
// Without a gateway ID, the direct Workers AI REST API is used instead.
async function callCloudflare(messages, maxTokens) {
  const cfg = PROVIDER_DEFAULTS.cloudflare;
  const apiKey = process.env[cfg.keyVar];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required for the cloudflare provider');
  const model = process.env[cfg.modelVar] || cfg.model;
  const gatewayId = process.env.CLOUDFLARE_GATEWAY_ID;

  if (gatewayId) {
    // AI Gateway – OpenAI-compatible endpoint
    // URL: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/workers-ai/v1/chat/completions
    const response = await fetch(
      `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/workers-ai/v1/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `Cloudflare AI Gateway error (${response.status} ${response.statusText})`);
    return data; // already OpenAI envelope
  }

  // Direct Workers AI REST API (no gateway)
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ messages, max_tokens: maxTokens }),
    }
  );
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message || 'Cloudflare Workers AI error');
  }
  return { choices: [{ message: { role: 'assistant', content: data.result.response } }] };
}

// ── Main AI dispatch ──────────────────────────────────────────────────────────
function callAI(provider, messages, maxTokens) {
  switch (provider) {
    case 'anthropic':  return callAnthropic(messages, maxTokens);
    case 'google':     return callGoogle(messages, maxTokens);
    case 'cloudflare': return callCloudflare(messages, maxTokens);
    default:           return callOpenAICompatible(provider, messages, maxTokens);
  }
}

// ── Security headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",        // Three.js needs inline styles
    "connect-src 'self' https://*.openai.com https://*.anthropic.com https://*.googleapis.com https://*.x.ai https://*.digitalocean.app https://*.cloudflarestorage.com https://*.openrouter.ai https://gateway.ai.cloudflare.com https://api.cloudflare.com",
    "img-src 'self' data:",
    "font-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors({ origin: ['http://localhost:5173', `http://localhost:${PORT}`] }));
app.use(express.json());

// Rate limit the chat API to prevent runaway AI spend
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // max 30 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
}

// Tells the client whether a server-side AI key is available so it knows
// whether to enter BYOK-only mode or can fall back to the server proxy.
app.get('/api/config', (_req, res) => {
  const provider = selectProvider();
  const cfg      = PROVIDER_DEFAULTS[provider];
  const hasKey   = !isPlaceholder(process.env[cfg.keyVar]);
  res.json({ byokOnly: !hasKey, serverProvider: hasKey ? provider : null });
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const provider = selectProvider();
  const cfg = PROVIDER_DEFAULTS[provider];
  const apiKey = process.env[cfg.keyVar];

  if (isPlaceholder(apiKey)) {
    return res.status(500).json({
      error: `No AI API key configured. Set ${cfg.keyVar} (or another supported provider key) in your .env file.`,
    });
  }

  // Token budget: default 150 to keep responses concise; override with AI_MAX_TOKENS
  const maxTokens = parseInt(process.env.AI_MAX_TOKENS || '150', 10);

  try {
    const data = await callAI(provider, messages, maxTokens);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback in production (rate-limited to prevent FS flooding)
const staticLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', staticLimiter, (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🧠 MindWalk server → http://localhost:${PORT}\n`);
});
