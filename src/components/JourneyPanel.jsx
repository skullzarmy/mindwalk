import { useRef, useEffect } from 'react';

export default function JourneyPanel({ wordPath, isOpen, onClose }) {
  const bottomRef = useRef(null);
  const headingId = 'map-panel-title';

  useEffect(() => {
    if (isOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [wordPath, isOpen]);

  return (
    <div
      id="map-panel"
      className={`side-panel map-panel ${isOpen ? 'open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-hidden={!isOpen}
    >
      <div className="panel-header">
        <span id={headingId}>🗺 JOURNEY MAP</span>
        <button onClick={onClose} className="close-btn" aria-label="Close journey map">✕</button>
      </div>

      <div className="panel-content">
        {wordPath.length === 0 ? (
          <p className="empty-state">
            No journey yet.<br />
            Click a word in the cloud to begin exploring.
          </p>
        ) : (
          <div className="journey-nodes">
            {wordPath.map((word, i) => (
              <div key={i} className="journey-node">
                <div className="journey-node-marker">
                  <span className="node-step">{String(i + 1).padStart(2, '0')}</span>
                  <div className={`node-dot ${i === wordPath.length - 1 ? 'node-dot-current' : ''}`} />
                  {i < wordPath.length - 1 && <div className="node-line" />}
                </div>
                <div className={`node-label ${i === wordPath.length - 1 ? 'node-label-current' : ''}`}>
                  {word}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
