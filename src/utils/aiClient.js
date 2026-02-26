// ── Client-side AI caller (BYOK) ──────────────────────────────────────────
// Reads settings from localStorage and makes API calls directly from the
// browser so the user's key never leaves their device.
// Mirrors the server-side provider logic in server.js but runs in the client.

import { getSettings } from './aiSettings.js';

const PROVIDER_URLS = {
  openai:     'https://api.openai.com/v1',
  anthropic:  'https://api.anthropic.com/v1',
  google:     'https://generativelanguage.googleapis.com/v1beta',
  xai:        'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

// ── OpenAI-compatible (openai / xai / openrouter) ─────────────────────────
async function callOpenAICompatible(baseUrl, apiKey, model, messages, maxTokens, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.85 }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'API error');
  return data; // already OpenAI envelope
}

// ── Anthropic ─────────────────────────────────────────────────────────────
async function callAnthropic(apiKey, model, messages, maxTokens) {
  const systemMsg    = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');
  const body = { model, max_tokens: maxTokens, messages: userMessages, temperature: 0.85 };
  if (systemMsg) body.system = systemMsg.content;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-api-key':     apiKey,
      'anthropic-version': '2023-06-01',
      // Required header for direct browser access per Anthropic docs
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Anthropic API error');
  return { choices: [{ message: { role: 'assistant', content: data.content[0].text } }] };
}

// ── Google Gemini ─────────────────────────────────────────────────────────
async function callGoogle(apiKey, model, messages, maxTokens) {
  const systemMsg = messages.find(m => m.role === 'system');
  const contents  = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85 } };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Google Gemini API error');
  const text = data.candidates[0].content.parts[0].text;
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}

// ── Cloudflare Workers AI ─────────────────────────────────────────────────
// apiKey format: "accountId:apiToken"
async function callCloudflare(apiKey, model, messages, maxTokens) {
  const colonIdx = apiKey.indexOf(':');
  if (colonIdx < 1) throw new Error('Cloudflare key must be in the format accountId:apiToken');
  const accountId = apiKey.slice(0, colonIdx);
  const token     = apiKey.slice(colonIdx + 1);
  const baseUrl   = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
  return callOpenAICompatible(baseUrl, token, model, messages, maxTokens);
}

// ── Public dispatcher ─────────────────────────────────────────────────────
export async function callAIClient(messages) {
  const { provider, apiKey, model, maxTokens } = getSettings();
  const baseUrl       = PROVIDER_URLS[provider];
  const resolvedModel = model || { openai: 'gpt-3.5-turbo', anthropic: 'claude-haiku-4-5', google: 'gemini-1.5-flash', xai: 'grok-3-mini', openrouter: 'openai/gpt-3.5-turbo', cloudflare: '@cf/meta/llama-3.1-8b-instruct' }[provider] || 'gpt-3.5-turbo';
  const resolvedMax   = maxTokens || 150;

  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, resolvedModel, messages, resolvedMax);
    case 'google':
      return callGoogle(apiKey, resolvedModel, messages, resolvedMax);
    case 'openrouter':
      return callOpenAICompatible(baseUrl, apiKey, resolvedModel, messages, resolvedMax, {
        'HTTP-Referer': window.location.origin,
        'X-Title':      'MindWalk',
      });
    case 'cloudflare':
      return callCloudflare(apiKey, resolvedModel, messages, resolvedMax);
    default:
      return callOpenAICompatible(baseUrl, apiKey, resolvedModel, messages, resolvedMax);
  }
}
