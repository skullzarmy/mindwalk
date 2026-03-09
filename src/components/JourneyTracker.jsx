import React from 'react';

/**
 * JourneyTracker displays a 10-star HUD indicating progress toward synthesis.
 * It also displays an early "Synthesize Journey" button once 5 stars are filled.
 */
export default function JourneyTracker({ wordPath, maxWords = 10, onSynthesizeEarly, isLoading }) {
  const currentCount = wordPath.length;
  const canSynthesize = currentCount >= 5;

  return (
    <div className="journey-tracker-hud" aria-label={`Journey progress: ${currentCount} of ${maxWords}`}>
      <div className="journey-stars">
        {Array.from({ length: maxWords }).map((_, i) => {
          const isFilled = i < currentCount;
          const isJustFilled = i === currentCount - 1 && currentCount > 0;
          
          return (
            <div 
              key={i} 
              className={`journey-star ${isFilled ? 'filled' : 'empty'} ${isJustFilled ? 'pulse' : ''}`}
              aria-hidden="true"
            >
              ★
            </div>
          );
        })}
      </div>
      
      {canSynthesize && currentCount < maxWords && (
        <button 
          className="synthesize-early-btn"
          onClick={onSynthesizeEarly}
          disabled={isLoading}
          aria-label="Synthesize journey early"
        >
          {isLoading ? 'Synthesizing...' : 'SYNTHESIZE JOURNEY ✨'}
        </button>
      )}
    </div>
  );
}
