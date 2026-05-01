'use client';

import { Undo2, StickyNote, Mic } from 'lucide-react';

interface Props {
  onRecall?: () => void;
  onNote?: () => void;
  onVoice?: () => void;
  showVoice?: boolean;
}

/**
 * Bottom action bar — secondaire acties tijdens KDS-service.
 * Recall = ongedaan maken laatste status-change.
 * Notitie = quick-add een service-notitie.
 * Voice = "Hey Rook" trigger (alleen als Pro+).
 */
export default function KdsBottomBar({ onRecall, onNote, onVoice, showVoice = false }: Props) {
  return (
    <div className="kds-bottom-bar">
      {onRecall && (
        <button onClick={onRecall} className="kds-bottom-bar__btn">
          <Undo2 size={18} />
          <span>Recall</span>
        </button>
      )}
      {onNote && (
        <button onClick={onNote} className="kds-bottom-bar__btn">
          <StickyNote size={18} />
          <span>Notitie</span>
        </button>
      )}
      {showVoice && onVoice && (
        <button onClick={onVoice} className="kds-bottom-bar__btn kds-bottom-bar__btn--brand">
          <Mic size={18} />
          <span>Hey Rook</span>
        </button>
      )}
    </div>
  );
}
