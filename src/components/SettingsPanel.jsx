import { useState, useEffect } from 'react';
import { getSettings, saveSettings, clearSettings, SUPPORTED_PROVIDERS } from '../utils/aiSettings.js';

export default function SettingsPanel({ isOpen, onClose, onSave, wizardMode = false }) {
  const [settings, setSettings] = useState(getSettings);
  const [step,     setStep]     = useState(wizardMode ? 1 : 0); // 0 = full panel, 1-3 = wizard
  const [showKey,  setShowKey]  = useState(false);
  const headingId = 'settings-panel-title';

  // Re-read settings each time panel opens
  useEffect(() => { if (isOpen) setSettings(getSettings()); }, [isOpen]);

  // Enter/exit wizard mode when prop changes
  useEffect(() => { setStep(wizardMode ? 1 : 0); }, [wizardMode]);

  const selectedProvider = SUPPORTED_PROVIDERS.find(p => p.id === settings.provider) || SUPPORTED_PROVIDERS[0];

  const handleSave = () => {
    saveSettings(settings);
    onSave?.(settings);
    onClose();
  };

  const handleClear = () => {
    if (window.confirm('Remove your saved API key and settings?')) {
      clearSettings();
      setSettings(getSettings());
    }
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
                    onClick={() => setSettings(s => ({ ...s, provider: p.id, model: '' }))}
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
              <p className="settings-note">
                🔒 Stored only in your browser's local storage. Never sent to this server.
                {settings.provider === 'cloudflare' && (
                  <> Enter as <code>accountId:apiToken</code>.</>
                )}
              </p>
              <div className="wizard-nav">
                <button className="cancel-btn" onClick={() => setStep(1)}>← BACK</button>
                <button
                  className="save-btn"
                  onClick={() => setStep(3)}
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
                You can change provider, model, or token settings anytime via the <strong>🔑 KEYS</strong> button.
              </p>
              <p className="settings-note">
                🔒 Your key is stored locally and all AI calls go directly from your browser to {selectedProvider.label}.
              </p>
              <button className="save-btn wizard-next-btn" onClick={handleSave}>
                START EXPLORING →
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
          <label htmlFor="settings-provider" className="settings-label">AI PROVIDER</label>
          <select
            id="settings-provider"
            value={settings.provider}
            onChange={e => setSettings(s => ({ ...s, provider: e.target.value, model: '' }))}
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
          {settings.apiKey
            ? <p className="settings-note">🔒 Stored locally · used only in your browser · never sent to this server.</p>
            : <p className="settings-note">Leave blank to use server-side key (if configured).</p>
          }
        </div>

        <div className="settings-section">
          <label htmlFor="settings-model" className="settings-label">
            MODEL <span className="settings-optional">(optional override)</span>
          </label>
          <input
            id="settings-model"
            type="text"
            value={settings.model}
            onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
            placeholder={selectedProvider.defaultModel}
            className="settings-input"
            aria-label="Model name override"
          />
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
          <button className="save-btn" onClick={handleSave}>SAVE SETTINGS</button>
          <button className="cancel-btn" onClick={onClose}>CANCEL</button>
        </div>

        {settings.apiKey && (
          <button className="settings-clear-btn" onClick={handleClear}>
            CLEAR SAVED KEY
          </button>
        )}

      </div>
    </div>
  );
}
