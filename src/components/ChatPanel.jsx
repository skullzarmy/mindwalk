import { useEffect, useRef } from 'react';

export default function ChatPanel({ messages, isOpen, onClose }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  return (
    <div className={`side-panel chat-panel ${isOpen ? 'open' : ''}`}>
      <div className="panel-header">
        <span>💬 CONVERSATION LOG</span>
        <button onClick={onClose} className="close-btn" aria-label="Close chat">✕</button>
      </div>

      <div className="panel-content">
        {messages.length === 0 ? (
          <p className="empty-state">
            No messages yet.<br />
            Type a thought below or click a word to begin.
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
