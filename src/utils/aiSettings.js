// ── AI Settings — non-sensitive BYOK configuration ────────────────────────────
// Non-sensitive settings (provider, model, maxTokens) are stored in localStorage.
// The API key is NEVER stored in plain-text localStorage.  It lives exclusively
// in memory (_memApiKey) and is persisted — when the user opts in — via
// secureStorage (encrypted IndexedDB) or sessionStorage.  See secureStorage.js.

const STORAGE_KEY = 'mindwalk_ai_settings';

export const SUPPORTED_PROVIDERS = [
  { id: 'openai',     label: 'OpenAI',          defaultModel: 'gpt-3.5-turbo',         keyPlaceholder: 'sk-...' },
  { id: 'anthropic',  label: 'Anthropic Claude', defaultModel: 'claude-haiku-4-5',      keyPlaceholder: 'sk-ant-...' },
  { id: 'google',     label: 'Google Gemini',    defaultModel: 'gemini-1.5-flash',      keyPlaceholder: 'AIza...' },
  { id: 'xai',        label: 'xAI / Grok',       defaultModel: 'grok-3-mini',           keyPlaceholder: 'xai-...' },
  { id: 'openrouter',         label: 'OpenRouter',              defaultModel: 'openai/gpt-3.5-turbo',            keyPlaceholder: 'sk-or-...' },
  { id: 'cloudflare-workers', label: 'Cloudflare Workers AI',   defaultModel: '@cf/meta/llama-3.1-8b-instruct', keyPlaceholder: 'accountId:apiToken' },
  { id: 'cloudflare',         label: 'Cloudflare AI Gateway',   defaultModel: '@cf/meta/llama-3.1-8b-instruct', keyPlaceholder: 'accountId:gatewayId:apiToken' },
];

const DEFAULT_SETTINGS = {
  provider:  'openai',
  model:     '',
  maxTokens: 150,
};

// ── In-memory API key ─────────────────────────────────────────────────────────
// The key is kept here after the user enters it or after it is decrypted from
// IndexedDB.  It is never written back to localStorage.
let _memApiKey = '';

export function getApiKey()    { return _memApiKey; }
export function setApiKey(key) { _memApiKey = key ?? ''; }
export function clearApiKey()  { _memApiKey = ''; }
export function hasUserKey()   { return Boolean(_memApiKey && _memApiKey.trim().length > 0); }

// ── Non-sensitive settings (localStorage) ─────────────────────────────────────

/** Return provider + model + maxTokens from localStorage (no API key). */
export function getSettings() {
  try {
    const raw  = localStorage.getItem(STORAGE_KEY);
    const base = raw ? JSON.parse(raw) : {};
    // Strip out any legacy plain-text key that may have been stored by an older version
    const { apiKey: _legacy, ...rest } = base; // eslint-disable-line no-unused-vars
    return { ...DEFAULT_SETTINGS, ...rest };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persist non-sensitive settings to localStorage.
 * The `apiKey` field is intentionally dropped — callers must use secureStorage.
 */
export function saveSettings({ apiKey: _ignored, ...settings } = {}) { // eslint-disable-line no-unused-vars
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));
}

/** Remove non-sensitive settings from localStorage. */
export function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Legacy migration ──────────────────────────────────────────────────────────
// Older versions stored the API key in plain text inside the settings object.
// On first load this key is extracted, put into memory (session only), and
// the plain-text copy is scrubbed from localStorage.

/** Returns the legacy plain-text API key stored in localStorage, if any. */
export function consumeLegacyKey() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.apiKey) return null;
    const legacy = parsed.apiKey;
    // Scrub the key from localStorage immediately
    const { apiKey: _drop, ...rest } = parsed; // eslint-disable-line no-unused-vars
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    return legacy;
  } catch {
    return null;
  }
}
