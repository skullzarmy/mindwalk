import { useState, useEffect } from 'react';
import { getSettings, saveSettings, clearSettings, getApiKey, setApiKey, clearApiKey, SUPPORTED_PROVIDERS } from '../utils/aiSettings.js';
import { saveEncryptedKey, clearEncryptedKey, saveSessionKey, clearSessionKey, hasEncryptedKey } from '../utils/secureStorage.js';
import { fetchModels } from '../utils/modelFetcher.js';

// Storage mode label copy — kept as constants so wizard and full panel stay in sync
const LABEL_SESSION   = <><strong>This session only</strong> — cleared when you close this tab</>;
const LABEL_ENCRYPTED = <><strong>Remember with passphrase</strong> — encrypted in your browser</>;

export default function SettingsPanel({
  isOpen,
  onClose,
  onSave,
  wizardMode = false,
  colorblindMode = false,
  onColorblindModeChange,
  promptTemplate = '',
  onPromptSave,
  showPath = true,
  onShowPathChange,
  pathColor = '#00ffff',
  onPathColorChange,
  pathStyle = 'line',
  onPathStyleChange,
}) {
  const [settings,      setSettings]      = useState(() => ({ ...getSettings(), apiKey: getApiKey() }));
  const [step,          setStep]          = useState(wizardMode ? 1 : 0); // 0 = full panel, 1-3 = wizard
  const [showKey,       setShowKey]       = useState(false);
  const [promptValue,   setPromptValue]   = useState(promptTemplate);
  // Storage mode: 'session' (default) or 'encrypted' (IndexedDB + passphrase)
  const [storageMode,   setStorageMode]   = useState('session');
  const [passphrase,    setPassphrase]    = useState('');
  const [showPass,      setShowPass]      = useState(false);
  const [saveError,     setSaveError]     = useState('');
  const [isSaving,      setIsSaving]      = useState(false);
  const [serverHasKey,  setServerHasKey]  = useState(false);
  // Model fetch state
  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoading,   setModelsLoading]   = useState(false);
  const [modelsError,     setModelsError]     = useState('');
  const [useCustomModel,  setUseCustomModel]  = useState(false);
  const headingId = 'settings-panel-title';

  // Re-read settings each time panel opens
  useEffect(() => {
    if (isOpen) {
      setSettings({ ...getSettings(), apiKey: getApiKey() });
      setSaveError('');
      setPassphrase('');
      // Detect current storage mode
      hasEncryptedKey().then(has => setStorageMode(has ? 'encrypted' : 'session'));
      // Check whether the server has its own API key configured
      fetch('/api/config')
        .then(r => r.json())
        .then(data => setServerHasKey(!data.byokOnly))
        .catch((err) => {
          console.error('[SettingsPanel] Could not fetch /api/config:', err);
          setServerHasKey(false);
        });
    }
  }, [isOpen]);

  // Sync prompt value when template prop changes or panel opens
  useEffect(() => { if (isOpen) setPromptValue(promptTemplate); }, [isOpen, promptTemplate]);

  // Enter/exit wizard mode when prop changes
  useEffect(() => { setStep(wizardMode ? 1 : 0); }, [wizardMode]);

  const selectedProvider = SUPPORTED_PROVIDERS.find(p => p.id === settings.provider) || SUPPORTED_PROVIDERS[0];
  const defaultModelOption = `— default (${selectedProvider.defaultModel}) —`;

  const handleSave = async () => {
    setSaveError('');
    // Validate passphrase requirement
    if (storageMode === 'encrypted' && settings.apiKey.trim() && !passphrase.trim()) {
      setSaveError('A passphrase is required to encrypt your key.');
      return;
    }
    setIsSaving(true);
    try {
      // Save non-sensitive settings to localStorage
      saveSettings(settings);

      if (settings.apiKey.trim()) {
        if (storageMode === 'encrypted') {
          // Encrypt key and persist to IndexedDB; clear any session copy
          await saveEncryptedKey(settings.apiKey, passphrase);
          clearSessionKey();
        } else {
          // Session-only: store in sessionStorage; clear any encrypted copy
          saveSessionKey(settings.apiKey);
          await clearEncryptedKey();
        }
        // Update in-memory key
        setApiKey(settings.apiKey);
      }

      onSave?.(settings);
      onClose();
    } catch (err) {
      setSaveError(err.message || 'Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (window.confirm('Remove your saved API key and settings?')) {
      clearSettings();
      clearApiKey();
      clearSessionKey();
      await clearEncryptedKey();
      setSettings({ ...getSettings(), apiKey: '' });
      setPassphrase('');
      setStorageMode('session');
    }
  };

  const handleFetchModels = async (providerOverride, keyOverride) => {
    const provider = providerOverride || settings.provider;
    const apiKey   = keyOverride   || settings.apiKey;
    setModelsLoading(true);
    setModelsError('');
    try {
      const models = await fetchModels(provider, apiKey);
      setAvailableModels(models);
      setUseCustomModel(false);
    } catch (err) {
      setModelsError(err.message || 'Failed to fetch models.');
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  const handleProviderChange = (providerId) => {
    setSettings(s => ({ ...s, provider: providerId, model: '' }));
    setAvailableModels([]);
    setModelsError('');
    setUseCustomModel(false);
  };

  // ── Wizard (BYOK-only first-run) ─────────────────────────────────────────
  if (step > 0) {
    return (
      <div
        id="settings-panel"
        className={`side-panel editor-panel settings-wizard ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-hidden={!isOpen}
      >
        <div className="panel-header">
          <span id={headingId} className="panel-title">🔑 AI SETUP</span>
        </div>

        {/* Step indicator */}
        <div className="wizard-steps" aria-label="Setup progress">
          {[1, 2, 3].map(n => (
            <div
              key={n}
              className={`wizard-step-dot${step > n ? ' done' : ''}${step === n ? ' active' : ''}`}
              aria-current={step === n ? 'step' : undefined}
            >
              {step > n ? '✓' : n}
            </div>
          ))}
        </div>

        <div className="panel-content">

          {/* ── Step 1: Choose provider ── */}
          {step === 1 && (
            <div className="wizard-step-body">
              <p className="wizard-intro">
                An API key from one of the supported providers is required to take a MindWalk.
                Your key stays in your browser and is used only for direct calls to the AI provider
                — it is never sent to this server.
              </p>
              <p className="settings-label">STEP 1 — CHOOSE YOUR AI PROVIDER</p>
              <div className="provider-list">
                {SUPPORTED_PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    className={`provider-btn${settings.provider === p.id ? ' selected' : ''}`}
                    onClick={() => handleProviderChange(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button className="save-btn wizard-next-btn" onClick={() => setStep(2)}>
                NEXT →
              </button>
            </div>
          )}

          {/* ── Step 2: Enter API key ── */}
          {step === 2 && (
            <div className="wizard-step-body">
              <p className="settings-label">STEP 2 — ENTER YOUR {selectedProvider.label.toUpperCase()} KEY</p>
              <div className="key-input-row">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))}
                  placeholder={selectedProvider.keyPlaceholder}
                  className="settings-input"
                  aria-label={`${selectedProvider.label} API key`}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="toggle-key-btn"
                  onClick={() => setShowKey(v => !v)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? '🙈' : '👁'}
                </button>
              </div>

              {/* Storage mode toggle */}
              <div className="storage-mode-group" role="group" aria-label="Key storage mode">
                <p className="settings-label" style={{ marginBottom: '6px' }}>HOW TO STORE YOUR KEY</p>
                <label className="storage-mode-option">
                  <input
                    type="radio"
                    name="wizardStorageMode"
                    value="session"
                    checked={storageMode === 'session'}
                    onChange={() => { setStorageMode('session'); setPassphrase(''); }}
                  />
                  <span>{LABEL_SESSION}</span>
                </label>
                <label className="storage-mode-option">
                  <input
                    type="radio"
                    name="wizardStorageMode"
                    value="encrypted"
                    checked={storageMode === 'encrypted'}
                    onChange={() => setStorageMode('encrypted')}
                  />
                  <span>{LABEL_ENCRYPTED}</span>
                </label>
              </div>

              {storageMode === 'encrypted' && (
                <div className="passphrase-section">
                  <label className="settings-label" htmlFor="wizard-passphrase">ENCRYPTION PASSPHRASE</label>
                  <div className="key-input-row">
                    <input
                      id="wizard-passphrase"
                      type={showPass ? 'text' : 'password'}
                      value={passphrase}
                      onChange={e => setPassphrase(e.target.value)}
                      placeholder="Choose a strong passphrase…"
                      className="settings-input"
                      aria-label="Encryption passphrase"
                      autoComplete="new-password"
                    />
                    <button
                      className="toggle-key-btn"
                      onClick={() => setShowPass(v => !v)}
                      aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
                    >
                      {showPass ? '🙈' : '👁'}
                    </button>
                  </div>
                  <p className="settings-note">
                    You will be prompted for this passphrase each time you open the app.
                  </p>
                </div>
              )}

              {storageMode === 'session' && (
                <p className="settings-note">
                  🔒 Key is kept only in memory for this tab — never written to disk.
                  {settings.provider === 'cloudflare-workers' && (
                    <> Enter as <code>accountId:apiToken</code>.</>
                  )}
                  {settings.provider === 'cloudflare' && (
                    <> Enter as <code>accountId:gatewayId:apiToken</code>.</>
                  )}
                </p>
              )}

              {saveError && <p className="settings-error" role="alert">{saveError}</p>}

              {/* Optional: fetch & pick a model once the key is entered */}
              {settings.apiKey.trim() && (
                <div className="wizard-model-section">
                  <div className="model-fetch-row">
                    <p className="settings-label" style={{ margin: 0 }}>
                      MODEL <span className="settings-optional">(optional)</span>
                    </p>
                    <button
                      className="fetch-models-btn"
                      onClick={() => handleFetchModels(settings.provider, settings.apiKey)}
                      disabled={modelsLoading}
                      aria-label="Fetch available models from provider"
                    >
                      {modelsLoading ? '⏳ FETCHING…' : '↻ FETCH MODELS'}
                    </button>
                  </div>
                  {modelsError && <p className="settings-error" role="alert">{modelsError}</p>}
                  {availableModels.length > 0 && !useCustomModel ? (
                    <select
                      value={settings.model}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setUseCustomModel(true);
                          setSettings(s => ({ ...s, model: '' }));
                        } else {
                          setSettings(s => ({ ...s, model: e.target.value }));
                        }
                      }}
                      className="settings-select"
                      aria-label="Select model"
                    >
                      <option value="">{defaultModelOption}</option>
                      {availableModels.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                      <option value="__custom__">— enter custom model name —</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={settings.model}
                      onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
                      placeholder={selectedProvider.defaultModel}
                      className="settings-input"
                      aria-label="Model name override"
                    />
                  )}
                  {availableModels.length > 0 && (
                    <p className="settings-note">{availableModels.length} models available</p>
                  )}
                </div>
              )}

              <div className="wizard-nav">
                <button className="cancel-btn" onClick={() => setStep(1)}>← BACK</button>
                <button
                  className="save-btn"
                  onClick={() => {
                    if (storageMode === 'encrypted' && settings.apiKey.trim() && !passphrase.trim()) {
                      setSaveError('A passphrase is required to encrypt your key.');
                      return;
                    }
                    setSaveError('');
                    setStep(3);
                  }}
                  disabled={!settings.apiKey.trim()}
                >
                  NEXT →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && (
            <div className="wizard-step-body">
              <p className="settings-label">STEP 3 — READY TO EXPLORE</p>
              <p className="wizard-intro">
                Using <strong>{selectedProvider.label}</strong> with your personal key.
                You can change provider, model, or token settings anytime via the <strong>⚙ SETTINGS</strong> button.
              </p>
              <p className="settings-note">
                {storageMode === 'encrypted'
                  ? '🔒 Your key will be encrypted with your passphrase and stored securely. You will be prompted for the passphrase on each visit.'
                  : '🔒 Your key is stored only in memory for this session. It will be cleared when this tab closes.'}
              </p>
              {saveError && <p className="settings-error" role="alert">{saveError}</p>}
              <button
                className="save-btn wizard-next-btn"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'SAVING…' : 'START EXPLORING →'}
              </button>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ── Full settings panel ───────────────────────────────────────────────────
  return (
    <div
      id="settings-panel"
      className={`side-panel editor-panel ${isOpen ? 'open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-hidden={!isOpen}
    >
      <div className="panel-header">
        <span id={headingId} className="panel-title">🔑 AI SETTINGS</span>
        <button onClick={onClose} className="close-btn" aria-label="Close settings">✕</button>
      </div>

      <div className="panel-content">

        <div className="settings-section">
          <span className="settings-label">DISPLAY</span>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={colorblindMode}
              onChange={e => onColorblindModeChange?.(e.target.checked)}
              aria-label="Toggle color-blind friendly mode"
            />
            <span>Color-blind friendly mode</span>
          </label>
        </div>

        <div className="settings-section">
          <span className="settings-label">PATH VISUALIZATION</span>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={showPath}
              onChange={e => onShowPathChange?.(e.target.checked)}
              aria-label="Toggle exploration path visibility"
            />
            <span>Show exploration path</span>
          </label>
          <label htmlFor="settings-path-style" className="settings-label" style={{ marginTop: '6px' }}>
            PATH STYLE
          </label>
          <select
            id="settings-path-style"
            value={pathStyle}
            onChange={e => onPathStyleChange?.(e.target.value)}
            className="settings-select"
            aria-label="Path style"
          >
            <option value="line">Simple line</option>
            <option value="tube">3D tube</option>
            <option value="particles">Particle trail</option>
          </select>
          <label htmlFor="settings-path-color" className="settings-label" style={{ marginTop: '6px' }}>
            PATH COLOR
          </label>
          <input
            id="settings-path-color"
            type="color"
            value={pathColor}
            onChange={e => onPathColorChange?.(e.target.value)}
            className="settings-path-color-input"
            aria-label="Path color"
          />
        </div>

        <div className="settings-section">
          <label htmlFor="settings-prompt" className="settings-label">PONDER PROMPT</label>
          <p className="editor-hint">
            Use <code>{'{WORD}'}</code> for the clicked word and <code>{'{PATH}'}</code> for the full journey path.
          </p>
          <textarea
            id="settings-prompt"
            className="prompt-textarea"
            value={promptValue}
            onChange={e => setPromptValue(e.target.value)}
            rows={5}
            spellCheck={false}
            aria-label="Ponder prompt template"
          />
          <div className="editor-preview">
            <span className="preview-label">Preview: </span>
            <em>{promptValue.replace('{WORD}', '<word>').replace('{PATH}', '<path>')}</em>
          </div>
          <button
            className="save-btn"
            style={{ marginTop: '8px' }}
            onClick={() => onPromptSave?.(promptValue)}
          >
            SAVE TEMPLATE
          </button>
        </div>

        <div className="settings-section">
          <label htmlFor="settings-provider" className="settings-label">AI PROVIDER</label>
          <select
            id="settings-provider"
            value={settings.provider}
            onChange={e => handleProviderChange(e.target.value)}
            className="settings-select"
          >
            {SUPPORTED_PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="settings-section">
          <label htmlFor="settings-apikey" className="settings-label">API KEY</label>
          <div className="key-input-row">
            <input
              id="settings-apikey"
              type={showKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))}
              placeholder={selectedProvider.keyPlaceholder}
              className="settings-input"
              aria-label={`${selectedProvider.label} API key`}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="toggle-key-btn"
              onClick={() => setShowKey(v => !v)}
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>

          {/* Storage mode toggle */}
          <div className="storage-mode-group" role="group" aria-label="Key storage mode">
            <p className="settings-label" style={{ marginBottom: '6px', marginTop: '10px' }}>
              API KEY STORAGE <span style={{ fontWeight: 'normal', fontSize: '0.9em' }}>(your browser only)</span>
            </p>
            <label className="storage-mode-option">
              <input
                type="radio"
                name="fullPanelStorageMode"
                value="session"
                checked={storageMode === 'session'}
                onChange={() => { setStorageMode('session'); setPassphrase(''); setSaveError(''); }}
              />
              <span>{LABEL_SESSION}</span>
            </label>
            <label className="storage-mode-option">
              <input
                type="radio"
                name="fullPanelStorageMode"
                value="encrypted"
                checked={storageMode === 'encrypted'}
                onChange={() => { setStorageMode('encrypted'); setSaveError(''); }}
              />
              <span>{LABEL_ENCRYPTED}</span>
            </label>
          </div>

          {storageMode === 'encrypted' && (
            <div className="passphrase-section">
              <label className="settings-label" htmlFor="full-passphrase">
                {settings.apiKey.trim() ? 'ENCRYPTION PASSPHRASE' : 'PASSPHRASE (required to re-encrypt on save)'}
              </label>
              <div className="key-input-row">
                <input
                  id="full-passphrase"
                  type={showPass ? 'text' : 'password'}
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  placeholder="Enter passphrase…"
                  className="settings-input"
                  aria-label="Encryption passphrase"
                  autoComplete="current-password"
                />
                <button
                  className="toggle-key-btn"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
              <p className="settings-note">
                You will be prompted for this passphrase each time you open the app.
              </p>
            </div>
          )}

          {!settings.apiKey ? (
            <p className="settings-note">
              {serverHasKey
                ? "Leave blank to use the server's API key."
                : 'Enter your own API key to continue.'
              }
            </p>
          ) : (
            <p className="settings-note">
              🔒 {storageMode === 'session'
                ? 'Stored in memory only, never sent to our server.'
                : 'Encrypted locally in your browser, never sent to our server.'
              }
            </p>
          )}

          {saveError && <p className="settings-error" role="alert">{saveError}</p>}
        </div>

        <div className="settings-section">
          <div className="model-fetch-row">
            <label htmlFor="settings-model" className="settings-label">
              MODEL <span className="settings-optional">(optional override)</span>
            </label>
            <button
              className="fetch-models-btn"
              onClick={() => handleFetchModels()}
              disabled={!settings.apiKey.trim() || modelsLoading}
              title={settings.apiKey.trim() ? 'Fetch available models from provider' : 'Enter an API key first'}
              aria-label="Fetch available models from provider"
            >
              {modelsLoading ? '⏳ FETCHING…' : '↻ FETCH MODELS'}
            </button>
          </div>
          {modelsError && <p className="settings-error" role="alert">{modelsError}</p>}
          {availableModels.length > 0 && !useCustomModel ? (
            <select
              id="settings-model"
              value={settings.model}
              onChange={e => {
                if (e.target.value === '__custom__') {
                  setUseCustomModel(true);
                  setSettings(s => ({ ...s, model: '' }));
                } else {
                  setSettings(s => ({ ...s, model: e.target.value }));
                }
              }}
              className="settings-select"
              aria-label="Select model"
            >
              <option value="">{defaultModelOption}</option>
              {availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value="__custom__">— enter custom model name —</option>
            </select>
          ) : (
            <input
              id="settings-model"
              type="text"
              value={settings.model}
              onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
              placeholder={selectedProvider.defaultModel}
              className="settings-input"
              aria-label="Model name override"
            />
          )}
          {availableModels.length > 0 && (
            <p className="settings-note">{availableModels.length} models available — select one or enter a custom name.</p>
          )}
        </div>

        <div className="settings-section">
          <label htmlFor="settings-tokens" className="settings-label">
            MAX TOKENS: {settings.maxTokens}
          </label>
          <input
            id="settings-tokens"
            type="range"
            min="50"
            max="500"
            step="25"
            value={settings.maxTokens}
            onChange={e => setSettings(s => ({ ...s, maxTokens: parseInt(e.target.value, 10) }))}
            className="settings-slider"
            aria-label="Max tokens per response"
          />
          <div className="slider-labels">
            <span>concise</span>
            <span>detailed</span>
          </div>
        </div>

        <div className="editor-actions">
          <button className="save-btn" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'SAVING…' : 'SAVE SETTINGS'}
          </button>
          <button className="cancel-btn" onClick={onClose} disabled={isSaving}>CANCEL</button>
        </div>

        {settings.apiKey && (
          <button className="settings-clear-btn" onClick={handleClear} disabled={isSaving}>
            CLEAR SAVED KEY
          </button>
        )}

      </div>
    </div>
  );
}
