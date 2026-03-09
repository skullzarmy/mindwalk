import React, { useRef, useState, useEffect } from 'react';
import { generateShareImage } from '../utils/generateShareImage.js';

// ── Custom Share Modal UI ───────────────────────────────────────────────────
function ShareModal({ onClose, result, wordPath }) {
  const [format, setFormat] = useState('portrait');
  const [images, setImages] = useState({ portrait: null, landscape: null });
  const [isGenerating, setIsGenerating] = useState(true);

  const shareText = `I discovered the ${result.constellation} Constellation on MindWalk!\n\n"${result.message}"\n\n#MindWalk`;

  /**
   * Concurrently generates both portrait and landscape formats client-side
   * so toggling is instantaneous for the user.
   */
  const generateBothFormats = async () => {
    setIsGenerating(true);

    try {
      const [portraitUrl, landscapeUrl] = await Promise.all([
        generateShareImage(result.constellation, wordPath, result.message, 'portrait'),
        generateShareImage(result.constellation, wordPath, result.message, 'landscape'),
      ]);

      setImages({ portrait: portraitUrl, landscape: landscapeUrl });

    } catch (err) {
      console.error("Image generation failed:", err.message || err);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    generateBothFormats();
  }, []); // Only run once on mount

  const currentImage = images[format];

  const handleDownload = () => {
    if (!currentImage) return;
    const link = document.createElement('a');
    link.download = `mindwalk-${result.constellation.replace(/\s+/g, '-').toLowerCase()}-${format}.png`;
    link.href = currentImage;
    link.click();
  };

  const handleX = () => {
    const text = encodeURIComponent(shareText + '\n\nhttps://mindwalk.joepeterson.work');
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  return (
    <div className="share-modal-backdrop" onClick={onClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>
        <button className="close-share" onClick={onClose}>✕</button>
        <h2>Share Your Journey</h2>
        
        <div className="share-format-toggles">
          <button 
            className={`format-btn ${format === 'portrait' ? 'active' : ''}`}
            onClick={() => setFormat('portrait')}
            disabled={isGenerating}
          >
            📱 Stories (9:16)
          </button>
          <button 
            className={`format-btn ${format === 'landscape' ? 'active' : ''}`}
            onClick={() => setFormat('landscape')}
            disabled={isGenerating}
          >
            🖥️ Poster (16:9)
          </button>
        </div>

        <div className="share-preview-wrapper" style={{ aspectRatio: format === 'portrait' ? '9/16' : '16/9' }}>
          {isGenerating ? (
            <div className="preview-loading">Forging Constellations...</div>
          ) : (
            <img src={currentImage} alt="Journey Card Draft" className="share-preview-img" />
          )}
        </div>
        
        <p className="share-hint">Your structural constellation and greater message have been captured perfectly.</p>
        
        <div className="share-modal-actions">
          <button className="sm-btn download" onClick={handleDownload} disabled={isGenerating}>
            <span className="icon">⬇</span> Download Image
          </button>
          <button className="sm-btn x-twitter" onClick={handleX} disabled={isGenerating}>
            <span className="icon">𝕏</span> Share on X
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Synthesis Overlay ──────────────────────────────────────────────────
export default function SynthesisOverlay({ result, wordPath, onContinue }) {
  const overlayRef = useRef(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  if (!result) return null;

  return (
    <>
      <div className="synthesis-overlay" ref={overlayRef}>
        <div className="synthesis-content">
          <div className="synthesis-eyebrow">A NEW CONSTELLATION DISCOVERED</div>
          <h1 className="synthesis-title">{result.constellation}</h1>
          
          <div className="synthesis-path">
            {wordPath.map((word, i) => (
              <span key={i} className="synth-word">
                {word}
                {i < wordPath.length - 1 && <span className="synth-arrow">→</span>}
              </span>
            ))}
          </div>

          <p className="synthesis-message">
            {result.message}
          </p>

          <div className="synthesis-actions">
            <button 
              className="capture-btn" 
              onClick={() => setIsShareModalOpen(true)}
            >
              SHARE JOURNEY 🚀
            </button>
            <button 
              className="close-synthesis-btn" 
              onClick={onContinue}
            >
              RESUME →
            </button>
          </div>
        </div>
      </div>
      
      {isShareModalOpen && (
        <ShareModal 
          onClose={() => setIsShareModalOpen(false)} 
          result={result} 
          wordPath={wordPath}
        />
      )}
    </>
  );
}
