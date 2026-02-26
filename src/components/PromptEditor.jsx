import { useState, useEffect } from 'react';

const DEFAULT_TEMPLATE =
  "Ponder the concept of '{WORD}' deeply. Share your thoughts, associations, and connections in 2-3 paragraphs.";

export default function PromptEditor({ template, isOpen, onSave, onClose }) {
  const [value, setValue] = useState(template || DEFAULT_TEMPLATE);

  useEffect(() => {
    setValue(template || DEFAULT_TEMPLATE);
  }, [template]);

  const preview = value.replace('{WORD}', '<word>');

  return (
    <div className={`side-panel editor-panel ${isOpen ? 'open' : ''}`}>
      <div className="panel-header">
        <span>⚙ PONDER PROMPT</span>
        <button onClick={onClose} className="close-btn" aria-label="Close editor">✕</button>
      </div>

      <div className="panel-content">
        <p className="editor-hint">
          Use <code>{'{WORD}'}</code> as a placeholder — it is replaced with
          the word you click in the cloud.
        </p>

        <textarea
          className="prompt-textarea"
          value={value}
          onChange={e => setValue(e.target.value)}
          rows={6}
          spellCheck={false}
        />

        <div className="editor-preview">
          <span className="preview-label">Preview: </span>
          <em>{preview}</em>
        </div>

        <div className="editor-actions">
          <button onClick={() => onSave(value)} className="save-btn">
            SAVE TEMPLATE
          </button>
          <button onClick={onClose} className="cancel-btn">
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
