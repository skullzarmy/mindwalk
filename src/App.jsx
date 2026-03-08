import { useState, useCallback, useRef, useEffect } from 'react';
import WordCloud3D   from './components/WordCloud3D.jsx';
import ChatPanel     from './components/ChatPanel.jsx';
import JourneyPanel  from './components/JourneyPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { extractWords } from './utils/textProcessing.js';

import { hasUserKey, setApiKey, consumeLegacyKey } from './utils/aiSettings.js';
import { hasEncryptedKey, loadEncryptedKey, getSessionKey, saveSessionKey } from './utils/secureStorage.js';
import { callAIClient } from './utils/aiClient.js';
import { saveWalk, exportWalk, parseImportedWalk } from './utils/walkStorage.js';
import './styles/main.css';

const DEFAULT_TEMPLATE =
  "We are on a mind walk, building a path of connected concepts. Journey so far: {PATH}. Now ponder '{WORD}' — share your key thoughts and connections in 2-3 sentences, weaving in how this concept relates to or diverges from the path.";

// Number of past AI responses to blend into the word cloud for a stream-of-thought effect
const STREAM_DEPTH = 5;

// Initial decorative words shown before the first AI response
const SEED_WORDS = [
  { word: 'consciousness', weight: 1.0  },
  { word: 'reality',       weight: 0.92 },
  { word: 'perception',    weight: 0.85 },
  { word: 'existence',     weight: 0.78 },
  { word: 'meaning',       weight: 0.70 },
  { word: 'thought',       weight: 0.63 },
  { word: 'wonder',        weight: 0.56 },
  { word: 'journey',       weight: 0.50 },
  { word: 'mind',          weight: 0.43 },
  { word: 'explore',       weight: 0.36 },
  { word: 'imagine',       weight: 0.30 },
  { word: 'create',        weight: 0.25 },
  { word: 'dream',         weight: 0.20 },
  { word: 'discover',      weight: 0.15 },
];

export default function App() {
  const [messages,        setMessages]        = useState([]);
  const [words,           setWords]           = useState(SEED_WORDS);
  const [promptTemplate,  setPromptTemplate]  = useState(DEFAULT_TEMPLATE);
  const [isLoading,       setIsLoading]       = useState(false);
  const [activePanel,     setActivePanel]     = useState(null); // 'chat'|'editor'|'map'|'settings'|null
  const [inputValue,      setInputValue]      = useState('');
  const [error,           setError]           = useState(null);
  const [lastWord,        setLastWord]        = useState(null);
  const [colorblindMode,  setColorblindMode]  = useState(false);
  const [wordPath,        setWordPath]        = useState([]);
  const [showPath,        setShowPath]        = useState(true);
  const [pathColor,       setPathColor]       = useState('#00ffff');
  const [pathStyle,       setPathStyle]       = useState('line');
  const [byokOnly,        setByokOnly]        = useState(false);
  const [wizardMode,      setWizardMode]      = useState(false);
  // Passphrase unlock modal — shown when an encrypted key exists but has not yet
  // been decrypted for this session.
  const [showPassphrasePrompt, setShowPassphrasePrompt] = useState(false);
  const [passphraseInput,      setPassphraseInput]      = useState('');
  const [passphraseError,      setPassphraseError]      = useState('');
  const [passphraseLoading,    setPassphraseLoading]    = useState(false);

  // keep latest messages in a ref so callbacks don't stale-close over them
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // keep latest wordPath in a ref for the same reason
  const wordPathRef = useRef([]);

  // ── On mount: load key from secure storage, then check server config ───────
  useEffect(() => {
    async function initApp() {
      // 1. Migrate any legacy plain-text key found in localStorage
      const legacy = consumeLegacyKey();
      if (legacy) {
        setApiKey(legacy);
        saveSessionKey(legacy); // treat migrated key as session-only going forward
      }

      // 2. Load session key (covers both fresh session-only saves and migrated keys)
      if (!hasUserKey()) {
        const sessionKey = getSessionKey();
        if (sessionKey) setApiKey(sessionKey);
      }

      // 3. If still no key in memory, check whether an encrypted key exists
      if (!hasUserKey()) {
        const encrypted = await hasEncryptedKey();
        if (encrypted) {
          setShowPassphrasePrompt(true);
          return; // defer server-config check until after unlock
        }
      }

      // 4. Check server config
      checkServerConfig();
    }

    function checkServerConfig() {
      fetch('/api/config')
        .then(r => r.json())
        .then(({ byokOnly: serverByokOnly }) => {
          setByokOnly(serverByokOnly);
          if (serverByokOnly && !hasUserKey()) {
            setWizardMode(true);
            setActivePanel('settings');
          }
        })
        .catch(() => {
          if (!hasUserKey()) {
            setByokOnly(true);
            setWizardMode(true);
            setActivePanel('settings');
          }
        });
    }

    initApp();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Called when the user submits the passphrase to unlock the encrypted key
  const handlePassphraseUnlock = useCallback(async () => {
    setPassphraseLoading(true);
    setPassphraseError('');
    try {
      const key = await loadEncryptedKey(passphraseInput);
      if (key) {
        setApiKey(key);
        setShowPassphrasePrompt(false);
        setPassphraseInput('');
        // Now proceed with server-config check
        fetch('/api/config')
          .then(r => r.json())
          .then(({ byokOnly: serverByokOnly }) => {
            setByokOnly(serverByokOnly);
          })
          .catch(() => {});
      }
    } catch (err) {
      if (err.message === 'incorrect-passphrase') {
        setPassphraseError('Incorrect passphrase. Please try again.');
      } else {
        setPassphraseError('Failed to decrypt key. Please try again.');
      }
    } finally {
      setPassphraseLoading(false);
    }
  }, [passphraseInput]);

  const handlePassphraseSkip = useCallback(() => {
    setShowPassphrasePrompt(false);
    setPassphraseInput('');
    // Fall through to wizard/server-config check
    fetch('/api/config')
      .then(r => r.json())
      .then(({ byokOnly: serverByokOnly }) => {
        setByokOnly(serverByokOnly);
        if (serverByokOnly && !hasUserKey()) {
          setWizardMode(true);
          setActivePanel('settings');
        }
      })
      .catch(() => {
        if (!hasUserKey()) {
          setByokOnly(true);
          setWizardMode(true);
          setActivePanel('settings');
        }
      });
  }, []);

  // ── Core API call ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content) => {
    setIsLoading(true);
    setError(null);

    const newMessages = [...messagesRef.current, { role: 'user', content }];
    setMessages(newMessages);

    try {
      let data;
      if (hasUserKey()) {
        // BYOK: call AI provider directly from browser using the stored key
        data = await callAIClient(newMessages);
      } else {
        // Server-proxy: use the server's configured key
        const res = await fetch('/api/chat', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messages: newMessages }),
        });
        data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'API request failed');
      }

      const assistant   = data.choices[0].message;
      const allMessages = [...newMessages, assistant];
      setMessages(allMessages);

      // Build word cloud from the last STREAM_DEPTH AI responses for a
      // stream-of-thought effect: words persist across turns, with recurring
      // concepts naturally weighted higher.
      const recentText = allMessages
        .filter(m => m.role === 'assistant')
        .slice(-STREAM_DEPTH)
        .map(m => m.content)
        .join(' ');
      setWords(extractWords(recentText));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Word-click handler ────────────────────────────────────────────────────
  const handleWordClick = useCallback((word) => {
    const newPath = [...wordPathRef.current, word];
    wordPathRef.current = newPath;
    setWordPath(newPath);

    const pathStr = newPath.join(' → ');
    let prompt = promptTemplate.replace('{WORD}', word);

    if (prompt.includes('{PATH}')) {
      prompt = prompt.replace('{PATH}', pathStr);
    } else if (newPath.length > 1) {
      // Append path context so the AI can weave connections across the journey
      prompt += `\n\n[Mind walk journey: ${pathStr}]`;
    }

    setLastWord(word);
    sendMessage(prompt);
  }, [promptTemplate, sendMessage]);

  // ── Form submit ───────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  // ── Panel toggle (only one open at a time) ───────────────────────────────
  /** @param {'chat'|'editor'|'map'|'settings'} name */
  const togglePanel = useCallback((name) => {
    setActivePanel(prev => (prev === name ? null : name));
  }, []);

  // ── Walk management ───────────────────────────────────────────────────────

  /** Reset to a fresh walk */
  const handleNewWalk = useCallback(() => {
    setMessages([]);
    setWords(SEED_WORDS);
    wordPathRef.current = [];
    setWordPath([]);
    setLastWord(null);
    setError(null);
  }, []);

  /** Branch the walk from an earlier path index (Phase 3 interactive path) */
  const handleBranchFromPath = useCallback((index) => {
    const newPath = wordPath.slice(0, index + 1);
    wordPathRef.current = newPath;
    setWordPath(newPath);
    // Trim conversation history: each word click produces ~2 messages (user + assistant)
    setMessages(prev => prev.slice(0, (index + 1) * 2));
  }, [wordPath]);

  /** Persist the current path to localStorage */
  const handleSaveWalk = useCallback(() => {
    if (wordPathRef.current.length > 0) {
      saveWalk(wordPathRef.current);
    }
  }, []);

  /** Download the current path as a JSON file */
  const handleExportWalk = useCallback(() => {
    if (wordPathRef.current.length > 0) {
      exportWalk(wordPathRef.current);
    }
  }, []);

  /**
   * Restore a path (from import or resume) then send a fresh AI prompt for
   * the last word so the walk can continue seamlessly.
   */
  const handleRestoreWalk = useCallback((path) => {
    if (!Array.isArray(path) || path.length === 0) return;
    // Pre-populate the ref with all words except the last
    const priorPath = path.slice(0, -1);
    const resumeWord = path[path.length - 1];
    setMessages([]);
    setWords(SEED_WORDS);
    setError(null);
    wordPathRef.current = priorPath;
    setWordPath(priorPath);
    // handleWordClick will append resumeWord, build the prompt, and call the API
    handleWordClick(resumeWord);
  }, [handleWordClick]);

  /** Parse a File object and restore the walk */
  const handleImportWalk = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const path = parseImportedWalk(e.target.result);
        handleRestoreWalk(path);
      } catch (err) {
        setError(`Import failed: ${err.message}`);
      }
    };
    reader.onerror = () => setError('Could not read the selected file');
    reader.readAsText(file);
  }, [handleRestoreWalk]);

  return (
    <div className={`app${colorblindMode ? ' colorblind-mode' : ''}`}>
      {/* Skip navigation link (WCAG 2.4.1) */}
      <a href="#main-input" className="skip-link">Skip to input</a>

      {/* ── Passphrase unlock modal ── */}
      {showPassphrasePrompt && (
        <div className="passphrase-overlay" role="dialog" aria-modal="true" aria-labelledby="passphrase-title">
          <div className="passphrase-modal">
            <h2 id="passphrase-title" className="passphrase-title">🔒 Unlock API Key</h2>
            <p className="passphrase-desc">
              Your API key is encrypted. Enter your passphrase to unlock it for this session.
            </p>
            <input
              type="password"
              className="settings-input passphrase-input"
              value={passphraseInput}
              onChange={e => setPassphraseInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !passphraseLoading && passphraseInput && handlePassphraseUnlock()}
              placeholder="Enter passphrase…"
              aria-label="Decryption passphrase"
              autoFocus
            />
            {passphraseError && (
              <p className="passphrase-error" role="alert">{passphraseError}</p>
            )}
            <div className="passphrase-actions">
              <button
                className="save-btn"
                onClick={handlePassphraseUnlock}
                disabled={passphraseLoading || !passphraseInput}
              >
                {passphraseLoading ? 'UNLOCKING…' : 'UNLOCK →'}
              </button>
              <button className="cancel-btn" onClick={handlePassphraseSkip}>
                SKIP (enter key manually)
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 3-D canvas fills the whole background */}
      <WordCloud3D
        words={words}
        onWordClick={handleWordClick}
        isLoading={isLoading}
        colorblindMode={colorblindMode}
        wordPath={wordPath}
        showPath={showPath}
        pathColor={pathColor}
        pathStyle={pathStyle}
        onBranchFromPath={handleBranchFromPath}
      />

      {/* Corner HUD brackets */}
      <div className="corner-bracket top-left"    aria-hidden="true" />
      <div className="corner-bracket top-right"   aria-hidden="true" />
      <div className="corner-bracket bottom-left" aria-hidden="true" />
      <div className="corner-bracket bottom-right" aria-hidden="true" />

      {/* ── Top HUD bar ── */}
      <header className="hud-header">
        <div className="hud-title">
          <span className="hud-icon" aria-hidden="true">🧠</span>
          <span>MINDWALK</span>
        </div>
        <nav className="hud-controls" aria-label="Application controls">
          <button
            className={`hud-btn ${activePanel === 'chat' ? 'active' : ''}`}
            onClick={() => togglePanel('chat')}
            aria-expanded={activePanel === 'chat'}
            aria-controls="chat-panel"
            title="Toggle conversation log"
          >
            💬 CHAT
          </button>
          <button
            className={`hud-btn ${activePanel === 'map' ? 'active' : ''}`}
            onClick={() => togglePanel('map')}
            aria-expanded={activePanel === 'map'}
            aria-controls="map-panel"
            title="View journey map"
          >
            🗺 JOURNEY
          </button>
          <button
            className={`hud-btn${activePanel === 'settings' ? ' active' : ''}${byokOnly && !hasUserKey() ? ' hud-btn-alert' : ''}`}
            onClick={() => { setWizardMode(false); togglePanel('settings'); }}
            aria-expanded={activePanel === 'settings'}
            aria-controls="settings-panel"
            title="Settings"
          >
            ⚙ SETTINGS
          </button>
        </nav>
      </header>

      {/* ── Path trail ── */}
      {wordPath.length > 0 && (
        <div className="path-trail" aria-label="Mind walk journey path">
          {wordPath.map((word, i) => (
            <span key={i} className="path-trail-item">
              {i > 0 && <span className="path-trail-arrow" aria-hidden="true">→</span>}
              <span className={`path-trail-node${i === wordPath.length - 1 ? ' path-trail-node-current' : ''}`}>
                {word}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* ── Loading indicator ── */}
      {isLoading && (
        <div className="loading-overlay" aria-live="polite">
          <div className="loading-ring" />
          <span>
            {lastWord ? `Pondering "${lastWord}"…` : 'Thinking…'}
          </span>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="error-banner" role="alert">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      {/* ── Bottom input bar ── */}
      <footer className="bottom-bar">
        <form onSubmit={handleSubmit} className="input-form" id="main-input">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={
              messages.length === 0
                ? 'Begin your mind walk… enter a thought to explore'
                : 'Continue exploring…'
            }
            disabled={isLoading}
            className="thought-input"
            aria-label="Thought input"
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="send-btn"
            aria-label="Submit thought"
          >
            EXPLORE →
          </button>
        </form>
        {messages.length > 0 && (
          <p className="hint">
            Click any word to ponder it&nbsp;&nbsp;·&nbsp;&nbsp;Drag to orbit&nbsp;&nbsp;·&nbsp;&nbsp;Scroll to zoom
          </p>
        )}
      </footer>

      {/* ── Side panels ── */}
      <ChatPanel
        messages={messages}
        isOpen={activePanel === 'chat'}
        onClose={() => setActivePanel(null)}
      />
      <JourneyPanel
        wordPath={wordPath}
        isOpen={activePanel === 'map'}
        onClose={() => setActivePanel(null)}
        onNewWalk={handleNewWalk}
        onSaveWalk={handleSaveWalk}
        onExportWalk={handleExportWalk}
        onImportWalk={handleImportWalk}
        onResumeWalk={handleRestoreWalk}
      />
      <SettingsPanel
        isOpen={activePanel === 'settings'}
        wizardMode={wizardMode}
        colorblindMode={colorblindMode}
        onColorblindModeChange={setColorblindMode}
        promptTemplate={promptTemplate}
        onPromptSave={setPromptTemplate}
        showPath={showPath}
        onShowPathChange={setShowPath}
        pathColor={pathColor}
        onPathColorChange={setPathColor}
        pathStyle={pathStyle}
        onPathStyleChange={setPathStyle}
        onClose={() => { setWizardMode(false); setActivePanel(null); }}
        onSave={() => { setWizardMode(false); setByokOnly(false); setActivePanel(null); }}
      />
    </div>
  );
}
