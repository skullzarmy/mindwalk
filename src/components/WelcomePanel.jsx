export default function WelcomePanel({ isOpen, onClose, byokRequired = false, onGetStarted }) {
  const headingId = 'welcome-panel-title';

  return (
    <div
      id="welcome-panel"
      className={`side-panel welcome-panel ${isOpen ? 'open' : ''}`}
      role="complementary"
      aria-labelledby={headingId}
      aria-hidden={!isOpen}
    >
      <div className="panel-header">
        <span id={headingId} className="panel-title">🧠 WHAT IS MINDWALK?</span>
        <button onClick={onClose} className="close-btn" aria-label="Close welcome panel">✕</button>
      </div>

      <div className="panel-content welcome-content">
        <p className="welcome-tagline">
          Follow your stream of thought through an infinite landscape of ideas.
        </p>

        <div className="welcome-section">
          <h3 className="welcome-section-title">HOW IT WORKS</h3>
          <ol className="welcome-steps">
            <li>Enter any word or concept to begin</li>
            <li>AI explores that idea and surfaces related concepts as an interactive 3D cloud</li>
            <li>Click any word to dive deeper — each click adds to your path</li>
            <li>Save and revisit your journey anytime</li>
          </ol>
        </div>

        <div className="welcome-section">
          <h3 className="welcome-section-title">FEATURES</h3>
          <ul className="welcome-features">
            <li><span className="welcome-icon" aria-hidden="true">🌐</span>Interactive 3D word cloud</li>
            <li><span className="welcome-icon" aria-hidden="true">🤖</span>AI-powered concept exploration</li>
            <li><span className="welcome-icon" aria-hidden="true">🗺</span>Journey tracking &amp; saving</li>
            <li><span className="welcome-icon" aria-hidden="true">🔑</span>Your key stays in your browser — never sent to this server</li>
            <li><span className="welcome-icon" aria-hidden="true">🔓</span><a href="https://github.com/skullzarmy/mindwalk" target="_blank" rel="noopener noreferrer" className="welcome-link">Open source</a> — run it yourself</li>
          </ul>
        </div>

        {byokRequired && onGetStarted ? (
          <button className="save-btn welcome-get-started-btn" onClick={onGetStarted}>
            GET STARTED — CONNECT YOUR AI →
          </button>
        ) : (
          <p className="welcome-cta">
            To get started, connect your AI provider using the panel on the right →
          </p>
        )}
      </div>
    </div>
  );
}
