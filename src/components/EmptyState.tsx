'use client';
import React from 'react';
import { Plus, Sparkles, Flame } from 'lucide-react';
import MetallicCard from './MetallicCard';
import { PAGE_CHIPS, EMPTY_STATE_CONFIG } from '@/lib/constants';

interface EmptyStateProps {
  page: string;
  onAction?: () => void;
  onAiChip?: (chip: string) => void;
  icon?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
}

export default function EmptyState({ page, onAction, onAiChip, icon, title, description, actionLabel }: EmptyStateProps) {
  const config = EMPTY_STATE_CONFIG[page];
  const chips = PAGE_CHIPS[page] || [];

  const displayTitle = title || config?.title || 'Nog geen gegevens';
  const displayDescription = description || config?.description || 'Begin met het toevoegen van je eerste item.';
  const displayActionLabel = actionLabel || config?.actionLabel || 'Toevoegen';

  return (
    <MetallicCard hover={false} className="p-8 md:p-12" accent="#c4a35a">
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(196,163,90,.15), rgba(196,163,90,.05))',
            border: '1px solid rgba(196,163,90,.2)',
          }}
        >
          <Flame size={24} style={{ color: '#c4a35a' }} />
        </div>

        {/* Title & Description */}
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
          {displayTitle}
        </h3>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
          {displayDescription}
        </p>

        {/* Primary Action */}
        {onAction && (
          <button className="btn btn-brand mb-6" onClick={onAction}>
            <Plus size={12} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
            {displayActionLabel}
          </button>
        )}

        {/* AI Suggestion Chips */}
        {chips.length > 0 && (
          <div className="w-full pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
              <Sparkles size={12} className="mr-1 inline-block align-middle" style={{ color: '#c4a35a' }} />
              Of vraag de AI
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {chips.slice(0, 3).map((chip) => (
                <button
                  key={chip}
                  onClick={() => onAiChip?.(chip)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                  style={{
                    background: 'rgba(196,163,90,.08)',
                    border: '1px solid rgba(196,163,90,.15)',
                    color: '#c4a35a',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(196,163,90,.15)';
                    e.currentTarget.style.borderColor = 'rgba(196,163,90,.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(196,163,90,.08)';
                    e.currentTarget.style.borderColor = 'rgba(196,163,90,.15)';
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </MetallicCard>
  );
}
