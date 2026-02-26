import { useRef, useEffect, useState, useCallback } from 'react';
import { getSavedWalks, deleteSavedWalk } from '../utils/walkStorage.js';

export default function JourneyPanel({
  wordPath,
  isOpen,
  onClose,
  onNewWalk,
  onSaveWalk,
  onExportWalk,
  onImportWalk,
  onResumeWalk,
}) {
  const bottomRef  = useRef(null);
  const fileRef    = useRef(null);
  const headingId  = 'map-panel-title';

  const [view,        setView]        = useState('journey'); // 'journey' | 'resume'
  const [savedWalks,  setSavedWalks]  = useState([]);
  const [confirmNew,  setConfirmNew]  = useState(false);

  // Reload saved walks whenever the resume sub-view becomes visible
  useEffect(() => {
    if (view === 'resume') {
      setSavedWalks(getSavedWalks());
    }
  }, [view]);

  // Reset to journey view when panel closes
  useEffect(() => {
    if (!isOpen) {
      setView('journey');
      setConfirmNew(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && view === 'journey' && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [wordPath, isOpen, view]);

  const handleNewClick = useCallback(() => {
    if (wordPath.length > 0) {
      setConfirmNew(true);
    } else {
      onNewWalk();
    }
  }, [wordPath.length, onNewWalk]);

  const confirmNewWalk = useCallback(() => {
    setConfirmNew(false);
    setView('journey');
    onNewWalk();
  }, [onNewWalk]);

  const handleSave = useCallback(() => {
    if (wordPath.length > 0) onSaveWalk();
  }, [wordPath.length, onSaveWalk]);

  const handleResumeClick = useCallback(() => {
    setView(v => v === 'resume' ? 'journey' : 'resume');
    setConfirmNew(false);
  }, []);

  const handleLoadSavedWalk = useCallback((path) => {
    setView('journey');
    onResumeWalk(path);
    onClose();
  }, [onResumeWalk, onClose]);

  const handleDeleteSaved = useCallback((e, id) => {
    e.stopPropagation();
    deleteSavedWalk(id);
    setSavedWalks(getSavedWalks());
  }, []);

  const handleImportClick = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportWalk(file);
      onClose();
    }
    // Reset so the same file can be re-imported if needed
    e.target.value = '';
  }, [onImportWalk, onClose]);

  function formatWalkDate(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

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

      {/* Walk action toolbar */}
      <div className="walk-actions" role="toolbar" aria-label="Walk actions">
        <button
          className="walk-action-btn"
          onClick={handleNewClick}
          title="Start a new walk"
          aria-label="New walk"
        >
          ✦ NEW
        </button>
        <button
          className="walk-action-btn"
          onClick={handleSave}
          disabled={wordPath.length === 0}
          title="Save current walk to browser storage"
          aria-label="Save walk"
        >
          💾 SAVE
        </button>
        <button
          className={`walk-action-btn ${view === 'resume' ? 'active' : ''}`}
          onClick={handleResumeClick}
          title="Resume a previously saved walk"
          aria-label="Resume saved walk"
          aria-expanded={view === 'resume'}
        >
          ▶ RESUME
        </button>
        <button
          className="walk-action-btn"
          onClick={onExportWalk}
          disabled={wordPath.length === 0}
          title="Export walk as JSON file"
          aria-label="Export walk"
        >
          ↓ EXPORT
        </button>
        <button
          className="walk-action-btn"
          onClick={handleImportClick}
          title="Import walk from JSON file"
          aria-label="Import walk"
        >
          ↑ IMPORT
        </button>
        {/* Hidden file input for import */}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="walk-file-input"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFileChange}
        />
      </div>

      {/* Confirm new walk overlay */}
      {confirmNew && (
        <div className="walk-confirm" role="alertdialog" aria-labelledby="confirm-new-label">
          <p id="confirm-new-label" className="walk-confirm-msg">
            Start a new walk? Your current path will be lost unless you save it first.
          </p>
          <div className="walk-confirm-actions">
            <button className="walk-action-btn walk-action-btn--danger" onClick={confirmNewWalk}>
              START NEW
            </button>
            <button className="walk-action-btn" onClick={() => setConfirmNew(false)}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      <div className="panel-content">
        {/* Resume sub-view */}
        {view === 'resume' && (
          <div className="resume-list">
            {savedWalks.length === 0 ? (
              <p className="empty-state">
                No saved walks yet.<br />
                Use <strong>SAVE</strong> to store your current journey.
              </p>
            ) : (
              savedWalks.map(walk => (
                <button
                  key={walk.id}
                  className="resume-item"
                  onClick={() => handleLoadSavedWalk(walk.path)}
                  aria-label={`Resume walk from ${formatWalkDate(walk.date)}: ${walk.path.join(' → ')}`}
                >
                  <div className="resume-item-meta">
                    <span className="resume-item-date">{formatWalkDate(walk.date)}</span>
                    <span className="resume-item-count">{walk.path.length} steps</span>
                    <button
                      className="resume-item-delete"
                      onClick={(e) => handleDeleteSaved(e, walk.id)}
                      aria-label="Delete this saved walk"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="resume-item-path">
                    {walk.path.join(' → ')}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Journey map view */}
        {view === 'journey' && (
          wordPath.length === 0 ? (
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
          )
        )}
      </div>
    </div>
  );
}
