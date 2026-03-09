// ── Model list fetcher (BYOK) ──────────────────────────────────────────────
// Uses the user's API key (browser-side, never proxied) to retrieve the list
// of models available for the chosen provider.  Returns an array of
// { id: string, label: string } objects sorted alphabetically by id.

const PROVIDER_URLS = {
  openai:     'https://api.openai.com/v1',
  xai:        'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

// ── OpenAI-compatible /models endpoint ───────────────────────────────────
async function fetchOpenAICompatibleModels(baseUrl, apiKey, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}`, ...extraHeaders },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return (data.data || [])
    .map(m => ({ id: m.id, label: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ── Anthropic /models ─────────────────────────────────────────────────────
async function fetchAnthropicModels(apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key':     apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return (data.data || [])
    .map(m => ({ id: m.id, label: m.display_name || m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ── Google Gemini /models ─────────────────────────────────────────────────
async function fetchGoogleModels(apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return (data.models || [])
    .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => ({
      id:    m.name.replace(/^models\//, ''),
      label: m.displayName || m.name.replace(/^models\//, ''),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ── Cloudflare Workers AI ─────────────────────────────────────────────────
// apiKey format: "accountId:apiToken"
async function fetchCloudflareWorkersModels(apiKey) {
  const colonIdx = apiKey.indexOf(':');
  if (colonIdx < 1) throw new Error('Cloudflare API key must be in the format accountId:apiToken');
  const accountId = apiKey.slice(0, colonIdx);
  const token     = apiKey.slice(colonIdx + 1);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?task=text-generation&per_page=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.errors?.[0]?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return (data.result || [])
    .map(m => ({ id: m.name, label: m.name }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ── Public dispatcher ─────────────────────────────────────────────────────
/**
 * Fetch the list of models available for the given provider + key.
 *
 * @param {string} provider  One of the SUPPORTED_PROVIDERS ids.
 * @param {string} apiKey    The user's API key (never leaves the browser).
 * @returns {Promise<Array<{id:string,label:string}>>}
 */
export async function fetchModels(provider, apiKey) {
  if (!apiKey?.trim()) throw new Error('An API key is required to fetch models.');

  switch (provider) {
    case 'openai':
      return fetchOpenAICompatibleModels(PROVIDER_URLS.openai, apiKey);

    case 'anthropic':
      return fetchAnthropicModels(apiKey);

    case 'google':
      return fetchGoogleModels(apiKey);

    case 'xai':
      return fetchOpenAICompatibleModels(PROVIDER_URLS.xai, apiKey);

    case 'openrouter':
      return fetchOpenAICompatibleModels(PROVIDER_URLS.openrouter, apiKey, {
        'HTTP-Referer': window.location.origin,
        'X-Title':      'MindWalk',
      });

    case 'cloudflare-workers':
      return fetchCloudflareWorkersModels(apiKey);

    case 'cloudflare': {
      // AI Gateway key format: "accountId:gatewayId:apiToken"
      // Reuse Workers AI model search with accountId:apiToken
      const parts = apiKey.split(':');
      if (parts.length < 3) throw new Error('Cloudflare AI Gateway key must be in the format accountId:gatewayId:apiToken');
      const cfKey = `${parts[0]}:${parts.slice(2).join(':')}`;
      return fetchCloudflareWorkersModels(cfKey);
    }

    default:
      throw new Error(`Model listing is not supported for provider: ${provider}`);
  }
}
