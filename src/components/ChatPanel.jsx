import { useEffect, useRef } from 'react';

export default function ChatPanel({ messages, isOpen, onClose }) {
  const bottomRef = useRef(null);
  const headingId = 'chat-panel-title';

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  return (
    <div
      id="chat-panel"
      className={`side-panel chat-panel ${isOpen ? 'open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-hidden={!isOpen}
    >
      <div className="panel-header">
        <span id={headingId}>💬 CONVERSATION LOG</span>
        <button onClick={onClose} className="close-btn" aria-label="Close conversation log">✕</button>
      </div>

      <div className="panel-content">
        {messages.length === 0 ? (
          <p className="empty-state">
            No messages yet.<br />
            Select a word or edit your prompt to begin.
          </p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`message message-${msg.role}`}>
              <div className="message-role">
                {msg.role === 'user' ? '▶ YOU' : '🧠 AI'}
              </div>
              <div className="message-content">{msg.content}</div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
