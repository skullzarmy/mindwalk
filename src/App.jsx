import { useState, useCallback, useRef, useEffect } from 'react';
import WordCloud3D from './components/WordCloud3D.jsx';
import ChatPanel    from './components/ChatPanel.jsx';
import PromptEditor from './components/PromptEditor.jsx';
import { extractWords } from './utils/textProcessing.js';
import './styles/main.css';

const DEFAULT_TEMPLATE =
  "Ponder the concept of '{WORD}' briefly. Share your key thoughts and connections in 2-3 sentences.";

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
  const [chatOpen,        setChatOpen]        = useState(false);
  const [editorOpen,      setEditorOpen]      = useState(false);
  const [inputValue,      setInputValue]      = useState('');
  const [error,           setError]           = useState(null);
  const [lastWord,        setLastWord]        = useState(null);
  const [colorblindMode,  setColorblindMode]  = useState(false);

  // keep latest messages in a ref so callbacks don't stale-close over them
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ── Core API call ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content) => {
    setIsLoading(true);
    setError(null);

    const newMessages = [...messagesRef.current, { role: 'user', content }];
    setMessages(newMessages);

    try {
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'API request failed');
      }

      const assistant  = data.choices[0].message;
      const allMessages = [...newMessages, assistant];
      setMessages(allMessages);
      setWords(extractWords(assistant.content));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Word-click handler ────────────────────────────────────────────────────
  const handleWordClick = useCallback((word) => {
    const prompt = promptTemplate.replace('{WORD}', word);
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

  // ── Panel toggles (only one open at a time) ───────────────────────────────
  const toggleChat = () => {
    setChatOpen(v => !v);
    setEditorOpen(false);
  };
  const toggleEditor = () => {
    setEditorOpen(v => !v);
    setChatOpen(false);
  };

  return (
    <div className={`app${colorblindMode ? ' colorblind-mode' : ''}`}>
      {/* Skip navigation link (WCAG 2.4.1) */}
      <a href="#main-input" className="skip-link">Skip to input</a>
      {/* 3-D canvas fills the whole background */}
      <WordCloud3D
        words={words}
        onWordClick={handleWordClick}
        isLoading={isLoading}
        colorblindMode={colorblindMode}
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
            className={`hud-btn ${colorblindMode ? 'active' : ''}`}
            onClick={() => setColorblindMode(v => !v)}
            aria-pressed={colorblindMode}
            title="Toggle color-blind friendly mode"
          >
            ♿ A11Y
          </button>
          <button
            className={`hud-btn ${editorOpen ? 'active' : ''}`}
            onClick={toggleEditor}
            aria-expanded={editorOpen}
            aria-controls="editor-panel"
            title="Edit ponder prompt"
          >
            ⚙ PROMPT
          </button>
          <button
            className={`hud-btn ${chatOpen ? 'active' : ''}`}
            onClick={toggleChat}
            aria-expanded={chatOpen}
            aria-controls="chat-panel"
            title="Toggle conversation log"
          >
            💬 CHAT
          </button>
        </nav>
      </header>

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
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />
      <PromptEditor
        template={promptTemplate}
        isOpen={editorOpen}
        onSave={(t) => { setPromptTemplate(t); setEditorOpen(false); }}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}
