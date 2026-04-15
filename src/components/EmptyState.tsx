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
    <MetallicCard hover={false} className="p-8 md:p-12" accent="var(--color-accent-gold)">
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent-gold) 15%, transparent), color-mix(in srgb, var(--color-accent-gold) 5%, transparent))',
            border: '1px solid color-mix(in srgb, var(--color-accent-gold) 20%, transparent)',
          }}
        >
          <Flame size={24} style={{ color: 'var(--color-accent-gold)' }} />
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
              <Sparkles size={12} className="mr-1 inline-block align-middle" style={{ color: 'var(--color-accent-gold)' }} />
              Of vraag de AI
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {chips.slice(0, 3).map((chip) => (
                <button
                  key={chip}
                  onClick={() => onAiChip?.(chip)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                  style={{
                    background: 'color-mix(in srgb, var(--color-accent-gold) 8%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-accent-gold) 15%, transparent)',
                    color: 'var(--color-accent-gold)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent-gold) 15%, transparent)';
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-accent-gold) 30%, transparent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent-gold) 8%, transparent)';
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-accent-gold) 15%, transparent)';
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
