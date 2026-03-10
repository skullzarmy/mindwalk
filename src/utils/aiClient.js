// ── Client-side AI caller (BYOK) ──────────────────────────────────────────
// Reads settings from localStorage and makes API calls directly from the
// browser so the user's key never leaves their device.
// Mirrors the server-side provider logic in server.js but runs in the client.

import { getSettings, getApiKey } from './aiSettings.js';

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

// ── Cloudflare Workers AI (direct) ───────────────────────────────────────
// apiKey format: "accountId:apiToken"
async function callCloudflareWorkers(apiKey, model, messages, maxTokens) {
  const colonIdx = apiKey.indexOf(':');
  if (colonIdx < 1) throw new Error('Cloudflare Workers AI key must be in the format accountId:apiToken');
  const accountId = apiKey.slice(0, colonIdx);
  const token     = apiKey.slice(colonIdx + 1);
  const baseUrl   = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
  return callOpenAICompatible(baseUrl, token, model, messages, maxTokens);
}

// ── Cloudflare AI Gateway ─────────────────────────────────────────────────
// apiKey format: "accountId:gatewayId:apiToken"
// Routes through the CF AI Gateway for unified billing, caching & observability.
// Gateway URL: https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/workers-ai/v1
async function callCloudflareGateway(apiKey, model, messages, maxTokens) {
  const parts = apiKey.split(':');
  if (parts.length < 3) throw new Error('Cloudflare AI Gateway key must be in the format accountId:gatewayId:apiToken');
  const accountId = parts[0];
  const gatewayId = parts[1];
  const token     = parts.slice(2).join(':'); // token itself may contain colons
  const baseUrl   = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/workers-ai/v1`;
  return callOpenAICompatible(baseUrl, token, model, messages, maxTokens);
}

// ── Public dispatcher ─────────────────────────────────────────────────────
export async function callAIClient(messages) {
  const { provider, model, maxTokens } = getSettings();
  const apiKey        = getApiKey();
  const baseUrl       = PROVIDER_URLS[provider];
  const resolvedModel = model || { openai: 'gpt-4o-mini', anthropic: 'claude-haiku-4-5', google: 'gemini-flash-lite-latest', xai: 'grok-3-mini-latest', openrouter: 'meta-llama/llama-4-maverick:free', 'cloudflare-workers': '@cf/meta/llama-4-scout-17b-16e-instruct', cloudflare: '@cf/meta/llama-4-scout-17b-16e-instruct' }[provider] || 'gpt-4o-mini';
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
    case 'cloudflare-workers':
      return callCloudflareWorkers(apiKey, resolvedModel, messages, resolvedMax);
    case 'cloudflare':
      return callCloudflareGateway(apiKey, resolvedModel, messages, resolvedMax);
    default:
      return callOpenAICompatible(baseUrl, apiKey, resolvedModel, messages, resolvedMax);
  }
}

// ── Synthesis dispatcher (Phase 5) ─────────────────────────────────────────
export async function callSynthesisClient(wordPath) {
  const { provider, model } = getSettings();
  const apiKey        = getApiKey();
  const baseUrl       = PROVIDER_URLS[provider];
  const resolvedModel = model || { openai: 'gpt-4o-mini', anthropic: 'claude-haiku-4-5', google: 'gemini-flash-lite-latest', xai: 'grok-3-mini-latest', openrouter: 'meta-llama/llama-4-maverick:free', 'cloudflare-workers': '@cf/meta/llama-4-scout-17b-16e-instruct', cloudflare: '@cf/meta/llama-4-scout-17b-16e-instruct' }[provider] || 'gpt-4o-mini';
  const resolvedMax   = 300; // Need more tokens for synthesis

  const systemPrompt = `You are "The Weaver", observing a user's mind walk journey.
The user has pondered a series of interconnected concepts: [${wordPath.join(' → ')}].

Analyze this chronological evolution of thoughts. What is the overarching narrative of this journey? How did their perspective shift from the first word to the last? What is the hidden philosophical relationship between these concepts?

You MUST respond in EXACTLY the following format, with no extra text or markdown:

CONSTELLATION: <A striking, beautiful 2-4 word name for this specific pattern of thoughts, like "The Constellation of Anxious Clarity" or "The Architecture of Patience">
MESSAGE: <A profound, thoughtful 2-sentence realization about how these specific concepts weave together into a greater truth.>`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Please synthesize my mind walk journey: [${wordPath.join(' → ')}]` }
  ];

  let data;
  switch (provider) {
    case 'anthropic':
      data = await callAnthropic(apiKey, resolvedModel, messages, resolvedMax);
      break;
    case 'google':
      data = await callGoogle(apiKey, resolvedModel, messages, resolvedMax);
      break;
    case 'openrouter':
      data = await callOpenAICompatible(baseUrl, apiKey, resolvedModel, messages, resolvedMax, {
        'HTTP-Referer': window.location.origin,
        'X-Title':      'MindWalk',
      });
      break;
    case 'cloudflare-workers':
      data = await callCloudflareWorkers(apiKey, resolvedModel, messages, resolvedMax);
      break;
    case 'cloudflare':
      data = await callCloudflareGateway(apiKey, resolvedModel, messages, resolvedMax);
      break;
    default:
      data = await callOpenAICompatible(baseUrl, apiKey, resolvedModel, messages, resolvedMax);
      break;
  }

  const content = data.choices[0].message.content;

  let constellation = "The Unknown Constellation";
  let message = "A journey without a clear destination reveals its own path.";

  const constMatch = content.match(/CONSTELLATION:\s*(.+)/i);
  const msgMatch = content.match(/MESSAGE:\s*([\s\S]+)/i);

  if (constMatch) constellation = constMatch[1].trim();
  if (msgMatch) message = msgMatch[1].trim();

  return { constellation, message };
}
