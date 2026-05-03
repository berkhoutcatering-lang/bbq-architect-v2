'use client';

import { History, Archive } from 'lucide-react';
import type { HistoryItem } from './types';

interface Props {
  items: HistoryItem[];
  onPick: (prompt: string) => void;
  onClear: () => void;
}

export default function HistoryRail({ items, onPick, onClear }: Props) {
  return (
    <aside
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 16,
        height: 'fit-content',
        position: 'sticky',
        top: 78,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: '.22em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 700,
          }}
        >
          Recent bedacht
        </span>
        <History size={13} color="var(--muted-light)" />
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '16px 4px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
          Geen geschiedenis. Bedenk je eerste concept.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((h) => (
            <button
              key={h.id}
              onClick={() => onPick(h.prompt)}
              className="bedenker-history-item"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--text)',
                transition: 'background .15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.prompt}
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted-light)', fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
                  {h.date}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: 'var(--muted)' }}>
                <span>
                  {h.total} concept{h.total === 1 ? '' : 'en'}
                </span>
                {h.saved > 0 && (
                  <>
                    <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--muted-light)' }} />
                    <span style={{ color: '#c4b5fd' }}>{h.saved} bewaard</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
          <button
            onClick={onClear}
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            <Archive size={11} /> Geschiedenis wissen
          </button>
        </div>
      )}
      <style jsx>{`
        :global(.bedenker-history-item:hover) {
          background: rgba(255, 255, 255, 0.04) !important;
        }
      `}</style>
    </aside>
  );
}
