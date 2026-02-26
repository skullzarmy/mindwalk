// ── AI Settings — localStorage-backed BYOK configuration ──────────────────
// Keys are stored ONLY in the browser's localStorage.
// They are used directly for client-side API calls and never sent to the server.

const STORAGE_KEY = 'mindwalk_ai_settings';

export const SUPPORTED_PROVIDERS = [
  { id: 'openai',     label: 'OpenAI',          defaultModel: 'gpt-3.5-turbo',         keyPlaceholder: 'sk-...' },
  { id: 'anthropic',  label: 'Anthropic Claude', defaultModel: 'claude-haiku-4-5',      keyPlaceholder: 'sk-ant-...' },
  { id: 'google',     label: 'Google Gemini',    defaultModel: 'gemini-1.5-flash',      keyPlaceholder: 'AIza...' },
  { id: 'xai',        label: 'xAI / Grok',       defaultModel: 'grok-3-mini',           keyPlaceholder: 'xai-...' },
  { id: 'openrouter', label: 'OpenRouter',        defaultModel: 'openai/gpt-3.5-turbo', keyPlaceholder: 'sk-or-...' },
];

const DEFAULT_SETTINGS = {
  provider:  'openai',
  apiKey:    '',
  model:     '',
  maxTokens: 150,
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));
}

export function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasUserKey() {
  const s = getSettings();
  return Boolean(s.apiKey && s.apiKey.trim().length > 0);
}
